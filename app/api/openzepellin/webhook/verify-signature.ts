import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies an OpenZeppelin Relayer HMAC-SHA256 webhook signature.
 *
 * @param rawBody      - raw request body bytes
 * @param signingKey   - WEBHOOK_SIGNING_KEY configured in the relayer
 * @param signatureHeader - value of the X-Signature request header (base64)
 * @returns true only when the signature is valid
 */
export function checkSignature(
  rawBody: Buffer,
  signingKey: string,
  signatureHeader: string,
): boolean {
  if (!signatureHeader) return false;

  // Reject non-base64 encodings (e.g. hex strings)
  if (!/^[A-Za-z0-9+/]+=*$/.test(signatureHeader)) return false;

  const expected = createHmac("sha256", signingKey).update(rawBody).digest();

  let actual: Buffer;
  try {
    actual = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }

  // timingSafeEqual requires identical lengths; check explicitly first
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(expected, actual);
}
