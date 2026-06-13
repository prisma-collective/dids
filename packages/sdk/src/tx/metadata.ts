import { L_DID } from '@prisma-events/dids-types';
import type { DIDEvent } from '@prisma-events/dids-types';

const MAX_METADATA_SIZE = 16000;  // ~16KB limit per §3.2.1
const MAX_STRING_LENGTH = 64;    // Cardano metadata string limit

/**
 * Chunks a string into an array of 64-character segments for Cardano metadata.
 * Cardano metadata has a 64-byte string limit per CIP-20.
 */
function chunkString(str: string): string | string[] {
  if (str.length <= MAX_STRING_LENGTH) {
    return str;
  }
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += MAX_STRING_LENGTH) {
    chunks.push(str.slice(i, i + MAX_STRING_LENGTH));
  }
  return chunks;
}

/**
 * Recursively converts an object for Cardano metadata, chunking long strings.
 * Null values are converted to empty string since Cardano metadata doesn't allow null.
 */
export function convertForMetadata(value: unknown): unknown {
  // Cardano metadata doesn't allow null - convert to empty string
  if (value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return chunkString(value);
  }
  if (Array.isArray(value)) {
    return value.map(convertForMetadata);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = convertForMetadata(v);
    }
    return result;
  }
  return value;
}

/**
 * Serializes an event to Cardano metadata format under a given label.
 * Long strings are chunked into arrays per Cardano's 64-byte string limit.
 * Reusable by both DID (L_DID=199674) and VC (L_VC=199675) events.
 */
export function serializeEventMetadata(
  label: number,
  event: Record<string, unknown>
): Record<string, unknown> {
  const chunkedEvent = convertForMetadata(event);
  const metadata = { [label]: chunkedEvent };

  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_SIZE) {
    throw new Error(`Metadata exceeds ${MAX_METADATA_SIZE} bytes: ${serialized.length}`);
  }

  return metadata;
}

/**
 * Serializes DIDEvent to Cardano metadata format.
 * Long strings are chunked into arrays per Cardano's 64-byte string limit.
 */
export function serializeDIDMetadata(event: DIDEvent): Record<string, unknown> {
  return serializeEventMetadata(L_DID, event as unknown as Record<string, unknown>);
}
