'use client';

import {
  NEGATIVE_REASONS,
  VOTE_COMMENT_MAX,
  likePercent,
  type NegativeReason,
} from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAccount } from '@/lib/account/store';
import { castVote, useMyVote, useVoteCounts } from '@/lib/leaderboard/votes';
import { ThumbDownIcon, ThumbUpIcon } from '../icons';
import styles from './game.module.css';

/**
 * 👍 / 👎 under the game (docs/specs/voting.md §2). Tapping the active button removes the vote;
 * a dislike opens an optional "what went wrong?" form as a full-width row of the toolbar.
 * Messages go to the player's toolbar.
 */
export function VoteButtons({
  gameId,
  highlight,
  onMessage,
}: {
  gameId: string;
  /** Draws attention to the buttons (the post-run vote prompt). */
  highlight: boolean;
  onMessage: (text: string) => void;
}) {
  const t = useTranslations('vote');
  const account = useAccount();
  const uid = account.status === 'signedIn' ? account.uid : null;
  const counts = useVoteCounts(gameId);
  const [vote, setVote] = useMyVote(gameId, uid);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  if (account.status === 'disabled') return null;
  const percent = counts ? likePercent(counts.likes, counts.dislikes) : null;

  async function choose(value: 1 | -1) {
    if (!uid) {
      onMessage(t('playFirst'));
      return;
    }
    const next = vote === value ? 0 : value;
    const previous = vote;
    setVote(next);
    setBusy(true);
    const outcome = await castVote(gameId, next);
    setBusy(false);
    if (!outcome.ok) {
      setVote(previous);
      onMessage(t(`errors.${outcome.reason}`));
      return;
    }
    setSheet(next === -1);
    if (next === 1) onMessage(t('thanks'));
  }

  const prompting = highlight && vote === 0 && uid !== null;
  return (
    <>
      <span className={styles.votes} data-highlight={prompting || undefined}>
        {prompting ? (
          <span className={styles.votePrompt} role="status">
            {t('prompt')}
          </span>
        ) : null}
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={vote === 1}
          aria-label={t('like')}
          title={t('like')}
          disabled={busy}
          onClick={() => choose(1)}
        >
          <ThumbUpIcon filled={vote === 1} />
        </button>
        {percent !== null ? (
          <span
            className={styles.likePercent}
            title={t('votes', { count: counts!.likes + counts!.dislikes })}
          >
            {t('percent', { percent })}
          </span>
        ) : null}
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={vote === -1}
          aria-label={t('dislike')}
          title={t('dislike')}
          disabled={busy}
          onClick={() => choose(-1)}
        >
          <ThumbDownIcon filled={vote === -1} />
        </button>
      </span>
      {sheet ? (
        <FeedbackSheet
          gameId={gameId}
          onDone={(text) => {
            setSheet(false);
            if (text) onMessage(text);
          }}
        />
      ) : null}
    </>
  );
}

function FeedbackSheet({
  gameId,
  onDone,
}: {
  gameId: string;
  onDone: (message: string | null) => void;
}) {
  const t = useTranslations('vote');
  const [reasons, setReasons] = useState<NegativeReason[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (reasons.length === 0 && !comment.trim()) {
      onDone(null);
      return;
    }
    setSending(true);
    const outcome = await castVote(gameId, -1, { reasons, comment: comment.trim() });
    setSending(false);
    if (outcome.ok) onDone(t('feedbackThanks'));
    else setError(t(`errors.${outcome.reason}`));
  }

  return (
    <form className={styles.feedback} onSubmit={send} aria-labelledby="feedback-title">
      <fieldset className={styles.reasons}>
        <legend id="feedback-title" className={styles.feedbackTitle}>
          {t('feedbackTitle')}
        </legend>
        {NEGATIVE_REASONS.map((reason) => (
          <label key={reason}>
            <input
              type="checkbox"
              checked={reasons.includes(reason)}
              onChange={(event) =>
                setReasons((current) =>
                  event.target.checked ? [...current, reason] : current.filter((r) => r !== reason),
                )
              }
            />
            {t(`reasons.${reason}`)}
          </label>
        ))}
      </fieldset>
      <label className={styles.comment}>
        <span>{t('commentLabel')}</span>
        <textarea
          value={comment}
          maxLength={VOTE_COMMENT_MAX}
          rows={2}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className={styles.feedbackError}>
          {error}
        </p>
      ) : null}
      <span className={styles.feedbackActions}>
        <button type="submit" className={styles.primarySmall} disabled={sending}>
          {t('send')}
        </button>
        <button type="button" className={styles.plainSmall} onClick={() => onDone(null)}>
          {t('skip')}
        </button>
      </span>
    </form>
  );
}
