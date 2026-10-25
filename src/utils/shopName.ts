/**
 * Shop Name Normalization Utility for ReSellBD
 * 
 * Compares shop names after normalizing:
 * - trim leading and trailing spaces
 * - collapse multiple spaces into one
 * - lowercase
 * - ignore punctuation and symbols
 * 
 * Supports both Latin (English) and Bengali (বাংলা) characters, including
 * Bengali vowel signs (kar) and combining marks (\p{M}).
 * 
 * Examples:
 * "Sky  Gadget!", "sky gadget", and "SKY-GADGET" -> "sky gadget"
 * "স্মার্ট  গ্যাজেট!" and "স্মার্ট-গ্যাজেট" -> "স্মার্ট গ্যাজেট"
 */

export function normalizeShopName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    // Replace all characters except Unicode letters (\p{L}), combining marks (\p{M}), and numbers (\p{N}) with space
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    // Collapse consecutive whitespace into a single space and trim edges
    .trim()
    .replace(/\s+/g, ' ');
}

export function isShopNameValid(name: string): boolean {
  const key = normalizeShopName(name);
  return key.length >= 2;
}
