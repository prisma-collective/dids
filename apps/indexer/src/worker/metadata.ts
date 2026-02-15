/**
 * Metadata reconstruction utilities.
 * Extracted from apps/dashboard/app/api/did/[did]/route.ts
 *
 * Handles Cardano metadata quirks:
 * - Strings >64 bytes are chunked into arrays (CIP-20)
 * - Null values stored as empty strings
 */

/**
 * Reconstructs a string that may have been chunked for Cardano metadata.
 * If the value is an array of strings, joins it back into a single string.
 */
export function unchunkString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('');
  }
  return String(value ?? '');
}

/**
 * Recursively reconstructs an object from Cardano metadata format:
 * - Joins chunked string arrays back into full strings
 * - Restores empty strings to null
 */
export function reconstructFromMetadata(value: unknown): unknown {
  if (value === '') {
    return null; // Empty string was used for null in metadata
  }
  if (Array.isArray(value)) {
    // Check if it's a chunked string (array of strings) or actual array
    if (value.length > 0 && value.every((item) => typeof item === 'string')) {
      return value.join('');
    }
    return value.map(reconstructFromMetadata);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = reconstructFromMetadata(v);
    }
    return result;
  }
  return value;
}
