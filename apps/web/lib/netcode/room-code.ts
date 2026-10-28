// Room codes: 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L), so a code can be
// read out loud or typed from a screenshot. 31^6 ≈ 887 million codes; a room lives two hours.

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** The same rule as firebase/database.rules.json. */
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

export function generateRoomCode(random: (n: number) => Uint8Array = cryptoBytes): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ROOM_CODE_ALPHABET.length);
  let code = '';
  while (code.length < ROOM_CODE_LENGTH) {
    for (const byte of random(ROOM_CODE_LENGTH * 2)) {
      if (byte < limit && code.length < ROOM_CODE_LENGTH) {
        code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
      }
    }
  }
  return code;
}

/** Normalizes what a player typed or pasted ("abc-123 " → "ABC123"); null when not a code. */
export function parseRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

function cryptoBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
