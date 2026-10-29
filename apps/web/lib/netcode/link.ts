'use client';

// The connection between the two players of a room (docs/adr/0010-online-matches.md).
// A WebRTC DataChannel carries the moves: direct when the networks allow it, otherwise through
// Cloudflare TURN. The handshake goes through RTDB inboxes (signals/{code}/{uid}). Until the
// channel is open, and whenever it drops, moves go through the RTDB relay (relay/{code}), so a
// match never waits on WebRTC.
import type { DataSnapshot, Unsubscribe } from 'firebase/database';
import { loadAuth, loadDatabase } from '@/lib/firebase/client';
import { STUN_ONLY } from './ice';

/** How the moves travel right now. */
export type LinkRoute = 'connecting' | 'direct' | 'turn' | 'relay';

export type PeerLink = {
  send(data: string): void;
  close(): void;
};

export type PeerLinkOptions = {
  code: string;
  me: string;
  peer: string;
  isHost: boolean;
  iceServers: RTCIceServer[];
  /** TURN only (iceTransportPolicy "relay"): every match when TURN credentials are available. */
  forceTurn?: boolean;
  onMessage(data: string): void;
  onRoute(route: LinkRoute): void;
};

/** Without an open channel after this long, the match runs on the relay meanwhile. */
const CONNECT_TIMEOUT_MS = 12_000;
/** A dropped channel is renegotiated after this delay, at most MAX_RETRIES times in a row. */
const RETRY_DELAY_MS = 3_000;
const MAX_RETRIES = 4;

type Signal = { from: string; kind: 'hello' | 'offer' | 'answer' | 'ice'; data: string };
type Payload = { n?: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit };

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/** ICE servers for this player: TURN credentials when the platform has them, else STUN. */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  try {
    const auth = await loadAuth();
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/ice-servers', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!response.ok) return STUN_ONLY;
    const body = (await response.json()) as { iceServers?: RTCIceServer[] };
    return Array.isArray(body.iceServers) && body.iceServers.length > 0
      ? body.iceServers
      : STUN_ONLY;
  } catch {
    return STUN_ONLY;
  }
}

export async function openPeerLink(options: PeerLinkOptions): Promise<PeerLink> {
  const { code, me, peer, isHost, onMessage, onRoute } = options;
  const db = await loadDatabase();
  const { ref, push, remove, onChildAdded, query, orderByKey, startAfter } =
    await import('firebase/database');

  const inbox = ref(db, `signals/${code}/${me}`);
  const outbox = ref(db, `signals/${code}/${peer}`);
  const relay = ref(db, `relay/${code}`);

  let closed = false;
  let pc: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  // The negotiation in progress: offers, answers and candidates of older ones are ignored.
  let negotiation = '';
  let pendingCandidates: RTCIceCandidateInit[] = [];
  let route: LinkRoute = 'connecting';
  let retries = 0;
  let connectTimer = 0;
  let retryTimer = 0;
  const unsubscribers: Unsubscribe[] = [];

  function setRoute(next: LinkRoute) {
    if (next === route || closed) return;
    route = next;
    onRoute(next);
  }

  function signal(kind: Signal['kind'], payload: Payload) {
    push(outbox, { from: me, kind, data: JSON.stringify(payload) }).catch((error) =>
      console.warn('[netcode] signal failed', error),
    );
  }

  function dropConnection() {
    channel?.close();
    pc?.close();
    channel = null;
    pc = null;
    pendingCandidates = [];
  }

  function armTimeout() {
    window.clearTimeout(connectTimer);
    connectTimer = window.setTimeout(() => {
      if (!channel || channel.readyState !== 'open') setRoute('relay');
    }, CONNECT_TIMEOUT_MS);
  }

  function newConnection(id: string): RTCPeerConnection {
    dropConnection();
    negotiation = id;
    const connection = new RTCPeerConnection({
      iceServers: options.iceServers,
      iceTransportPolicy: options.forceTurn ? 'relay' : 'all',
    });
    connection.onicecandidate = (event) => {
      if (event.candidate && negotiation === id)
        signal('ice', { n: id, c: event.candidate.toJSON() });
    };
    connection.onconnectionstatechange = () => {
      if (connection !== pc) return;
      if (connection.connectionState === 'failed') channelLost();
    };
    armTimeout();
    pc = connection;
    return connection;
  }

  function useChannel(next: RTCDataChannel) {
    channel = next;
    next.onopen = () => {
      retries = 0;
      window.clearTimeout(connectTimer);
      void detectRoute();
    };
    next.onmessage = (event) => {
      if (typeof event.data === 'string') onMessage(event.data);
    };
    next.onclose = () => {
      if (next === channel) channelLost();
    };
  }

  // TURN or direct: the selected candidate pair says which.
  async function detectRoute() {
    const connection = pc;
    if (!connection) return;
    let viaTurn = false;
    try {
      const stats = await connection.getStats();
      let pair: { localCandidateId?: string; remoteCandidateId?: string } | undefined;
      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId)
          pair = stats.get(report.selectedCandidatePairId);
      });
      stats.forEach((report) => {
        if (
          !pair &&
          report.type === 'candidate-pair' &&
          report.nominated &&
          report.state === 'succeeded'
        )
          pair = report;
      });
      const local = pair?.localCandidateId ? stats.get(pair.localCandidateId) : undefined;
      const remote = pair?.remoteCandidateId ? stats.get(pair.remoteCandidateId) : undefined;
      viaTurn = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
    } catch {
      // Stats are informational only.
    }
    if (connection === pc && channel?.readyState === 'open') setRoute(viaTurn ? 'turn' : 'direct');
  }

  function channelLost() {
    if (closed) return;
    dropConnection();
    setRoute('relay');
    if (retries >= MAX_RETRIES) return;
    retries += 1;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(restart, RETRY_DELAY_MS * retries);
  }

  // The host makes the offers; the guest asks for one with a hello.
  function restart() {
    if (closed) return;
    if (isHost) void makeOffer();
    else {
      armTimeout();
      signal('hello', {});
    }
  }

  async function makeOffer() {
    const id = randomId();
    const connection = newConnection(id);
    useChannel(connection.createDataChannel('moves', { ordered: true }));
    try {
      await connection.setLocalDescription(await connection.createOffer());
      if (negotiation === id && connection.localDescription)
        signal('offer', { n: id, sdp: connection.localDescription.toJSON() });
    } catch (error) {
      console.warn('[netcode] offer failed', error);
    }
  }

  async function acceptOffer(id: string, sdp: RTCSessionDescriptionInit) {
    const connection = newConnection(id);
    connection.ondatachannel = (event) => {
      if (connection === pc) useChannel(event.channel);
    };
    try {
      await connection.setRemoteDescription(sdp);
      await flushCandidates(connection);
      await connection.setLocalDescription(await connection.createAnswer());
      if (negotiation === id && connection.localDescription)
        signal('answer', { n: id, sdp: connection.localDescription.toJSON() });
    } catch (error) {
      console.warn('[netcode] answer failed', error);
    }
  }

  async function flushCandidates(connection: RTCPeerConnection) {
    const queued = pendingCandidates;
    pendingCandidates = [];
    for (const candidate of queued) {
      await connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  async function handleSignal(snapshot: DataSnapshot) {
    const value = snapshot.val() as Signal | null;
    // Every signal is read once: consume it so the inbox stays empty.
    remove(snapshot.ref).catch(() => undefined);
    if (closed || !value || value.from !== peer) return;
    let payload: Payload;
    try {
      payload = JSON.parse(value.data) as Payload;
    } catch {
      return;
    }
    switch (value.kind) {
      case 'hello':
        if (isHost) {
          retries = 0;
          await makeOffer();
        }
        break;
      case 'offer':
        if (!isHost && payload.n && payload.sdp) await acceptOffer(payload.n, payload.sdp);
        break;
      case 'answer':
        if (
          isHost &&
          pc &&
          payload.n === negotiation &&
          payload.sdp &&
          pc.signalingState === 'have-local-offer'
        ) {
          await pc.setRemoteDescription(payload.sdp).catch(() => undefined);
          await flushCandidates(pc);
        }
        break;
      case 'ice':
        if (!pc || payload.n !== negotiation || !payload.c) break;
        if (pc.remoteDescription) await pc.addIceCandidate(payload.c).catch(() => undefined);
        else pendingCandidates.push(payload.c);
        break;
    }
  }

  // Signals are handled one at a time, in the order they were written.
  let queue = Promise.resolve();
  unsubscribers.push(
    onChildAdded(inbox, (snapshot) => {
      queue = queue.then(() => handleSignal(snapshot)).catch(() => undefined);
    }),
  );

  // Relay: only moves written after this page joined (push keys sort by time).
  const since = push(relay).key ?? '';
  unsubscribers.push(
    onChildAdded(query(relay, orderByKey(), startAfter(since)), (snapshot) => {
      const value = snapshot.val() as { from?: string; data?: string } | null;
      if (closed || !value || value.from === me) return;
      remove(snapshot.ref).catch(() => undefined);
      if (typeof value.data === 'string') onMessage(value.data);
    }),
  );

  restart();

  return {
    send(data) {
      if (closed) return;
      if (channel?.readyState === 'open') {
        try {
          channel.send(data);
          return;
        } catch {
          // Fall through to the relay.
        }
      }
      push(relay, { from: me, data }).catch((error) =>
        console.warn('[netcode] relay failed', error),
      );
    },
    close() {
      closed = true;
      window.clearTimeout(connectTimer);
      window.clearTimeout(retryTimer);
      unsubscribers.forEach((stop) => stop());
      dropConnection();
    },
  };
}
