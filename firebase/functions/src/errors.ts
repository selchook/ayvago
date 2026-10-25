import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

/**
 * A callable error whose reason ("taken", "cooldown", …) travels in `details.reason`, where the
 * client reads it to show localized text. The message alone is not reliable: the client SDK
 * appends the HTTP status to it.
 */
export function fail(
  code: FunctionsErrorCode,
  reason: string,
  extra: Record<string, unknown> = {},
): HttpsError {
  return new HttpsError(code, reason, { reason, ...extra });
}
