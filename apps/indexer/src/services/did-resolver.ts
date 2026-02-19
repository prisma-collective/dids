import { eq, and, desc, asc, sql, count } from 'drizzle-orm';
import { didEvents } from '../db/schema.js';
import type { Database } from '../db/connection.js';

export interface ResolvedDID {
  did: string;
  document: unknown | null;
  metadata: {
    created: string | null;
    updated: string | null;
    version: number;
    deactivated: boolean;
  };
}

export interface DIDHistoryResult {
  did: string;
  events: Array<{
    txHash: string;
    action: string;
    version: number;
    prevTxHash: string | null;
    ipfsCid: string | null;
    blockHeight: number;
    timestamp: string;
    valid: boolean;
    confirmed: boolean;
  }>;
  total: number;
  limit: number;
  offset: number;
}

/**
 * Resolves a DID to its current state by querying the latest valid, confirmed event.
 * Fetches the DID Document from IPFS if available.
 */
export async function resolveDID(
  db: Database,
  did: string,
  includeUnconfirmed = false
): Promise<ResolvedDID | 'not_found' | 'revoked'> {
  // Build conditions: valid=true, optionally confirmed=true
  const conditions = [eq(didEvents.did, did), eq(didEvents.valid, true)];
  if (!includeUnconfirmed) {
    conditions.push(eq(didEvents.confirmed, true));
  }

  // Get the latest event (highest version)
  const latest = await db
    .select()
    .from(didEvents)
    .where(and(...conditions))
    .orderBy(desc(didEvents.version))
    .limit(1);

  if (latest.length === 0) {
    return 'not_found';
  }

  const event = latest[0]!;

  if (event.action === 'revoke') {
    return 'revoked';
  }

  // Run create-event query + IPFS fetch in parallel (independent of each other)
  const [createEvent, document] = await Promise.all([
    db
      .select({ timestamp: didEvents.timestamp })
      .from(didEvents)
      .where(
        and(
          eq(didEvents.did, did),
          eq(didEvents.action, 'create'),
          eq(didEvents.valid, true)
        )
      )
      .limit(1),
    event.ipfsCid
      ? fetchFromIPFS(event.ipfsCid).catch((err) => {
          console.warn(`Failed to fetch DID Document from IPFS (${event.ipfsCid}):`, err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return {
    did,
    document,
    metadata: {
      created: createEvent[0]?.timestamp?.toISOString() ?? null,
      updated: event.timestamp.toISOString(),
      version: event.version,
      deactivated: false,
    },
  };
}

/**
 * Gets the event history for a DID with pagination.
 */
export async function getDIDHistory(
  db: Database,
  did: string,
  options: {
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
    includeUnconfirmed?: boolean;
  } = {}
): Promise<DIDHistoryResult | 'not_found'> {
  const {
    limit = 50,
    offset = 0,
    order = 'desc',
    includeUnconfirmed = false,
  } = options;

  const conditions = [eq(didEvents.did, did), eq(didEvents.valid, true)];
  if (!includeUnconfirmed) {
    conditions.push(eq(didEvents.confirmed, true));
  }

  // Run count + data queries in parallel
  const orderFn = order === 'asc' ? asc : desc;
  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: count() })
      .from(didEvents)
      .where(and(...conditions)),
    db
      .select({
        txHash: didEvents.txHash,
        action: didEvents.action,
        version: didEvents.version,
        prevTxHash: didEvents.prevTxHash,
        ipfsCid: didEvents.ipfsCid,
        blockHeight: didEvents.blockHeight,
        timestamp: didEvents.timestamp,
        valid: didEvents.valid,
        confirmed: didEvents.confirmed,
      })
      .from(didEvents)
      .where(and(...conditions))
      .orderBy(orderFn(didEvents.version))
      .limit(limit)
      .offset(offset),
  ]);

  const total = totalResult[0]?.count ?? 0;

  if (total === 0) {
    return 'not_found';
  }

  return {
    did,
    events: rows.map((r) => ({
      ...r,
      prevTxHash: r.prevTxHash,
      ipfsCid: r.ipfsCid,
      blockHeight: r.blockHeight,
      timestamp: r.timestamp.toISOString(),
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Simple LRU cache for IPFS documents.
 * IPFS CIDs are content-addressed (immutable) — once fetched, the content never changes.
 */
const IPFS_CACHE_MAX = 500;
const ipfsCache = new Map<string, unknown>();

function ipfsCacheGet(cid: string): unknown | undefined {
  const val = ipfsCache.get(cid);
  if (val !== undefined) {
    // Move to end (most recently used)
    ipfsCache.delete(cid);
    ipfsCache.set(cid, val);
  }
  return val;
}

function ipfsCacheSet(cid: string, value: unknown): void {
  if (ipfsCache.size >= IPFS_CACHE_MAX) {
    // Evict oldest entry (first key)
    const oldest = ipfsCache.keys().next().value;
    if (oldest !== undefined) ipfsCache.delete(oldest);
  }
  ipfsCache.set(cid, value);
}

/**
 * Fetches a JSON document from IPFS via public gateway.
 * Results are cached in-memory since CIDs are immutable.
 * 5-second timeout to avoid blocking resolution.
 */
async function fetchFromIPFS(cid: string): Promise<unknown> {
  const cached = ipfsCacheGet(cid);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
    const data = await res.json();
    ipfsCacheSet(cid, data);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
