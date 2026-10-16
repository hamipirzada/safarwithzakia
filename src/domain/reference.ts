/**
 * Human-readable enquiry references such as "SWZ-2610-7K3QX":
 * prefix, year+month of submission, then 5 random Crockford base32 characters
 * (no I, L, O or U, so references are easy to read out over the phone).
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RANDOM_LENGTH = 5;

export const REFERENCE_PATTERN = /^SWZ-\d{4}-[0-9A-HJKMNP-TV-Z]{5}$/;

export function generateEnquiryReference(
  now: Date,
  randomBytes: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length)),
): string {
  const yy = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const bytes = randomBytes(RANDOM_LENGTH);
  let suffix = "";
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    // 256 is a multiple of 32, so masking keeps the distribution uniform.
    suffix += ALPHABET[bytes[i]! & 31];
  }
  return `SWZ-${yy}${mm}-${suffix}`;
}

/** Accepts user-typed references with lowercase or ambiguous characters. */
export function normaliseReference(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/\s+/g, "");
}
