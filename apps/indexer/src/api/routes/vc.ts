import type { FastifyInstance } from 'fastify';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import type { Database } from '../../db/connection.js';
import { vcEvents } from '../../db/schema.js';
import { listSchemas } from '@prisma-dids/schemas';

// ─── Types ───

export interface VCEventRow {
  id: string;
  txHash: string;
  txIndex: number | null;
  event: string;
  issuerDid: string;
  holderDid: string;
  validatorDid: string | null;
  signerStakeAddress: string | null;
  vcHash: string;
  vcType: string;
  vcFormat: string;
  ipfsCid: string | null;
  reason: string | null;
  valid: boolean;
  validationError: string | null;
  confirmed: boolean;
  confirmedAtHeight: number | null;
  blockHeight: number;
  timestamp: Date;
  createdAt: Date;
}

export interface VCStatus {
  vcHash: string;
  status: 'active' | 'revoked' | 'unknown';
  confirmed: boolean;
  issuer?: string;
  holder?: string;
  vcType?: string;
  issuedAt?: string;
  issuedTxHash?: string;
  issuedTxConfirmed?: boolean;
  revokedAt?: string;
  revokedTxHash?: string;
  reason?: string;
}

/** Narrow input type for reduceVCStatus — only the columns the reducer actually reads.
 *  Keeps the route projection and reducer in sync via TS (Audit Fix: type-safety). */
export type VCStatusInput = Pick<VCEventRow,
  | 'txHash' | 'txIndex' | 'event' | 'issuerDid' | 'holderDid'
  | 'signerStakeAddress' | 'vcHash' | 'vcType' | 'reason'
  | 'confirmed' | 'blockHeight' | 'timestamp'
>;

// ─── Status Reducer (§4.3.1) ───

/**
 * Deterministic VC status reducer.
 *
 * 1. Sort by blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC
 * 2. Find first issue event → canonical issuer
 * 3. If no issue → 'unknown'
 * 4. Check for authorized revoke (signerStakeAddress matches canonical issuer's stake)
 * 5. Unauthorized revokes are ignored (remain stored but no status effect)
 *
 * The events are pre-filtered by the caller (confirmed-only or all valid).
 * The reducer is mode-independent (Audit Fix #12).
 */
export function reduceVCStatus(events: VCStatusInput[]): VCStatus {
  if (events.length === 0) {
    return { vcHash: '', status: 'unknown', confirmed: true };
  }

  // Sort in chain order
  const sorted = [...events].sort((a, b) => {
    if (a.blockHeight !== b.blockHeight) return a.blockHeight - b.blockHeight;
    const aIdx = a.txIndex ?? Number.MAX_SAFE_INTEGER;
    const bIdx = b.txIndex ?? Number.MAX_SAFE_INTEGER;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.txHash.localeCompare(b.txHash);
  });

  // Find canonical issuer — earliest issue event
  const canonicalIssue = sorted.find(e => e.event === 'issue');
  if (!canonicalIssue) {
    return { vcHash: sorted[0]!.vcHash, status: 'unknown', confirmed: true };
  }

  const canonicalIssuerStake = canonicalIssue.issuerDid.replace('did:cardano:', '');

  // Check for authorized revoke
  const authorizedRevoke = sorted.find(
    e => e.event === 'revoke' && e.signerStakeAddress === canonicalIssuerStake
  );

  if (authorizedRevoke) {
    return {
      vcHash: canonicalIssue.vcHash,
      status: 'revoked',
      confirmed: canonicalIssue.confirmed && authorizedRevoke.confirmed,
      issuer: canonicalIssue.issuerDid,
      holder: canonicalIssue.holderDid,
      vcType: canonicalIssue.vcType,
      issuedAt: canonicalIssue.timestamp.toISOString(),
      issuedTxHash: canonicalIssue.txHash,
      issuedTxConfirmed: canonicalIssue.confirmed,
      revokedAt: authorizedRevoke.timestamp.toISOString(),
      revokedTxHash: authorizedRevoke.txHash,
      reason: authorizedRevoke.reason ?? undefined,
    };
  }

  return {
    vcHash: canonicalIssue.vcHash,
    status: 'active',
    confirmed: canonicalIssue.confirmed,
    issuer: canonicalIssue.issuerDid,
    holder: canonicalIssue.holderDid,
    vcType: canonicalIssue.vcType,
    issuedAt: canonicalIssue.timestamp.toISOString(),
    issuedTxHash: canonicalIssue.txHash,
    issuedTxConfirmed: canonicalIssue.confirmed,
  };
}

// ─── Route Handlers ───

/**
 * GET /vc/:vcHash — All anchor events for a credential.
 * GET /vc/:vcHash/status — Current status (active/revoked/unknown).
 */
export function registerVCResolveRoutes(app: FastifyInstance, db: Database) {
  // GET /vc/:vcHash
  app.get<{
    Params: { vcHash: string };
    Querystring: { includeUnconfirmed?: string };
  }>('/vc/:vcHash', async (request, reply) => {
    const { vcHash } = request.params;
    const includeUnconfirmed = request.query.includeUnconfirmed === 'true';

    const conditions = includeUnconfirmed
      ? and(eq(vcEvents.vcHash, vcHash), eq(vcEvents.valid, true))
      : and(eq(vcEvents.vcHash, vcHash), eq(vcEvents.valid, true), eq(vcEvents.confirmed, true));

    const events = await db
      .select({
        txHash: vcEvents.txHash,
        event: vcEvents.event,
        issuerDid: vcEvents.issuerDid,
        holderDid: vcEvents.holderDid,
        validatorDid: vcEvents.validatorDid,
        vcType: vcEvents.vcType,
        vcFormat: vcEvents.vcFormat,
        ipfsCid: vcEvents.ipfsCid,
        reason: vcEvents.reason,
        confirmed: vcEvents.confirmed,
        blockHeight: vcEvents.blockHeight,
        timestamp: vcEvents.timestamp,
      })
      .from(vcEvents)
      .where(conditions)
      .orderBy(
        asc(vcEvents.blockHeight),
        sql`${vcEvents.txIndex} ASC NULLS LAST`,
        asc(vcEvents.txHash)
      );

    if (events.length === 0) {
      return reply.code(404).send({ error: 'No events found for this vcHash', vcHash });
    }

    return reply.send({
      vcHash,
      events: events.map(e => ({
        txHash: e.txHash,
        event: e.event,
        issuerDid: e.issuerDid,
        holderDid: e.holderDid,
        validatorDid: e.validatorDid,
        vcType: e.vcType,
        vcFormat: e.vcFormat,
        ipfsCid: e.ipfsCid,
        reason: e.reason,
        confirmed: e.confirmed,
        blockHeight: e.blockHeight,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  });

  // GET /vc/:vcHash/status
  app.get<{
    Params: { vcHash: string };
    Querystring: { includeUnconfirmed?: string };
  }>('/vc/:vcHash/status', async (request, reply) => {
    const { vcHash } = request.params;
    const includeUnconfirmed = request.query.includeUnconfirmed === 'true';

    const conditions = includeUnconfirmed
      ? and(eq(vcEvents.vcHash, vcHash), eq(vcEvents.valid, true))
      : and(eq(vcEvents.vcHash, vcHash), eq(vcEvents.valid, true), eq(vcEvents.confirmed, true));

    const events = await db
      .select({
        txHash: vcEvents.txHash,
        txIndex: vcEvents.txIndex,
        event: vcEvents.event,
        issuerDid: vcEvents.issuerDid,
        holderDid: vcEvents.holderDid,
        signerStakeAddress: vcEvents.signerStakeAddress,
        vcHash: vcEvents.vcHash,
        vcType: vcEvents.vcType,
        reason: vcEvents.reason,
        confirmed: vcEvents.confirmed,
        blockHeight: vcEvents.blockHeight,
        timestamp: vcEvents.timestamp,
      })
      .from(vcEvents)
      .where(conditions)
      .orderBy(
        asc(vcEvents.blockHeight),
        sql`${vcEvents.txIndex} ASC NULLS LAST`,
        asc(vcEvents.txHash)
      );

    const status = reduceVCStatus(events);

    if (status.status === 'unknown' && events.length === 0) {
      return reply.code(404).send({ error: 'No events found for this vcHash', vcHash });
    }

    reply.header('Cache-Control', 'public, max-age=30');
    return reply.send(status);
  });
}

/**
 * GET /issuer/:did/credentials — Paginated VCs issued by a DID.
 */
export function registerVCIssuerRoutes(app: FastifyInstance, db: Database) {
  app.get<{
    Params: { did: string };
    Querystring: {
      limit?: string;
      offset?: string;
      order?: string;
      includeUnconfirmed?: string;
    };
  }>('/issuer/:did/credentials', async (request, reply) => {
    const { did } = request.params;
    const limit = Math.max(1, Math.min(Number(request.query.limit) || 20, 100));
    const offset = Math.max(0, Number(request.query.offset) || 0);
    const isAsc = request.query.order === 'asc';
    const includeUnconfirmed = request.query.includeUnconfirmed === 'true';

    const conditions = includeUnconfirmed
      ? and(eq(vcEvents.issuerDid, did), eq(vcEvents.event, 'issue'), eq(vcEvents.valid, true))
      : and(eq(vcEvents.issuerDid, did), eq(vcEvents.event, 'issue'), eq(vcEvents.valid, true), eq(vcEvents.confirmed, true));

    // Deterministic tuple ordering to prevent duplicates/skips with offset pagination
    const ordering = isAsc
      ? [asc(vcEvents.blockHeight), sql`${vcEvents.txIndex} ASC NULLS LAST`, asc(vcEvents.txHash)]
      : [desc(vcEvents.blockHeight), sql`${vcEvents.txIndex} DESC NULLS FIRST`, desc(vcEvents.txHash)];

    const [events, countResult] = await Promise.all([
      db
        .select({
          vcHash: vcEvents.vcHash,
          holderDid: vcEvents.holderDid,
          vcType: vcEvents.vcType,
          vcFormat: vcEvents.vcFormat,
          ipfsCid: vcEvents.ipfsCid,
          txHash: vcEvents.txHash,
          confirmed: vcEvents.confirmed,
          blockHeight: vcEvents.blockHeight,
          timestamp: vcEvents.timestamp,
        })
        .from(vcEvents)
        .where(conditions)
        .orderBy(...ordering)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vcEvents)
        .where(conditions),
    ]);

    return reply.send({
      issuer: did,
      credentials: events.map(e => ({
        vcHash: e.vcHash,
        holderDid: e.holderDid,
        vcType: e.vcType,
        vcFormat: e.vcFormat,
        ipfsCid: e.ipfsCid,
        txHash: e.txHash,
        confirmed: e.confirmed,
        blockHeight: e.blockHeight,
        timestamp: e.timestamp.toISOString(),
      })),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  });
}

/**
 * GET /holder/:did/credentials — Paginated VCs held by a DID.
 */
export function registerVCHolderRoutes(app: FastifyInstance, db: Database) {
  app.get<{
    Params: { did: string };
    Querystring: {
      limit?: string;
      offset?: string;
      order?: string;
      includeUnconfirmed?: string;
    };
  }>('/holder/:did/credentials', async (request, reply) => {
    const { did } = request.params;
    const limit = Math.max(1, Math.min(Number(request.query.limit) || 20, 100));
    const offset = Math.max(0, Number(request.query.offset) || 0);
    const isAsc = request.query.order === 'asc';
    const includeUnconfirmed = request.query.includeUnconfirmed === 'true';

    const conditions = includeUnconfirmed
      ? and(eq(vcEvents.holderDid, did), eq(vcEvents.event, 'issue'), eq(vcEvents.valid, true))
      : and(eq(vcEvents.holderDid, did), eq(vcEvents.event, 'issue'), eq(vcEvents.valid, true), eq(vcEvents.confirmed, true));

    // Deterministic tuple ordering to prevent duplicates/skips with offset pagination
    const ordering = isAsc
      ? [asc(vcEvents.blockHeight), sql`${vcEvents.txIndex} ASC NULLS LAST`, asc(vcEvents.txHash)]
      : [desc(vcEvents.blockHeight), sql`${vcEvents.txIndex} DESC NULLS FIRST`, desc(vcEvents.txHash)];

    const [events, countResult] = await Promise.all([
      db
        .select({
          vcHash: vcEvents.vcHash,
          issuerDid: vcEvents.issuerDid,
          vcType: vcEvents.vcType,
          vcFormat: vcEvents.vcFormat,
          ipfsCid: vcEvents.ipfsCid,
          txHash: vcEvents.txHash,
          confirmed: vcEvents.confirmed,
          blockHeight: vcEvents.blockHeight,
          timestamp: vcEvents.timestamp,
        })
        .from(vcEvents)
        .where(conditions)
        .orderBy(...ordering)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vcEvents)
        .where(conditions),
    ]);

    return reply.send({
      holder: did,
      credentials: events.map(e => ({
        vcHash: e.vcHash,
        issuerDid: e.issuerDid,
        vcType: e.vcType,
        vcFormat: e.vcFormat,
        ipfsCid: e.ipfsCid,
        txHash: e.txHash,
        confirmed: e.confirmed,
        blockHeight: e.blockHeight,
        timestamp: e.timestamp.toISOString(),
      })),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  });
}

/**
 * GET /schemas — Supported credential schemas from registry.
 */
export function registerVCSchemasRoute(app: FastifyInstance, _db: Database) {
  app.get('/schemas', async (_request, reply) => {
    const schemas = listSchemas();
    return reply.send({
      schemas: schemas.map(s => ({
        vct: s.vct,
        disclosableFields: s.disclosableFields,
      })),
    });
  });
}
