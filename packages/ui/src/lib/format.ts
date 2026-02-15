/**
 * Truncate a DID string for display.
 * Example: "did:cardano:stake1u9abc...xyz123"
 */
export function truncateDid(did: string, chars = 12): string {
  if (did.length <= chars * 2 + 3) return did;
  return `${did.slice(0, chars)}...${did.slice(-chars)}`;
}

/**
 * Format an ISO date string for display.
 * Locale-aware via Intl.DateTimeFormat.
 */
export function formatDate(isoDate: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoDate));
}
