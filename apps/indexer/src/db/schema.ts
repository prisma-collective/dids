import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  bigint,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// --- did_events (per TECHNICAL_DESIGN §9.2) ---

export const didEvents = pgTable(
  'did_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    did: text('did').notNull(),
    txHash: text('tx_hash').notNull().unique(),
    action: text('action').notNull(), // create | update | revoke
    version: integer('version').notNull(),
    prevTxHash: text('prev_tx_hash'),
    ipfsCid: text('ipfs_cid'),
    valid: boolean('valid').notNull().default(true),
    validationError: text('validation_error'),
    confirmed: boolean('confirmed').notNull().default(false),
    confirmedAtHeight: bigint('confirmed_at_height', { mode: 'number' }),
    blockHeight: bigint('block_height', { mode: 'number' }).notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    rawEvent: text('raw_event').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // Resolver hot path: latest valid+confirmed event per DID
    index('idx_did_valid_confirmed_version').on(table.did, table.version)
      .where(sql`${table.valid} = true AND ${table.confirmed} = true`),
    // History queries
    index('idx_did_version').on(table.did, table.version),
    // Polling checkpoint + confirmation pass
    index('idx_block_height').on(table.blockHeight),
    // Confirmation pass scan (only unconfirmed events)
    index('idx_confirmed').on(table.confirmed)
      .where(sql`${table.confirmed} = false`),
  ]
);

// --- vc_events (per TECHNICAL_DESIGN §9.2, P2 Phase 4.2) ---

export const vcEvents = pgTable(
  'vc_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    txHash: text('tx_hash').notNull().unique(),
    txIndex: integer('tx_index'),
    event: text('event').notNull(), // issue | validate | revoke
    issuerDid: text('issuer_did').notNull(),
    holderDid: text('holder_did').notNull(),
    validatorDid: text('validator_did'),
    /** Stake address derived from payloadSig.address at ingest time.
     *  Used by the status reducer for revoke authorization (Audit Fix #20). */
    signerStakeAddress: text('signer_stake_address'),
    vcHash: text('vc_hash').notNull(),
    vcType: text('vc_type').notNull(),
    vcFormat: text('vc_format').notNull(),
    reason: text('reason'),
    valid: boolean('valid').notNull().default(true),
    validationError: text('validation_error'),
    confirmed: boolean('confirmed').notNull().default(false),
    confirmedAtHeight: bigint('confirmed_at_height', { mode: 'number' }),
    blockHeight: bigint('block_height', { mode: 'number' }).notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    rawEvent: text('raw_event').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_vc_hash').on(table.vcHash),
    index('idx_vc_issuer_did').on(table.issuerDid),
    index('idx_vc_holder_did').on(table.holderDid),
    index('idx_vc_block_height').on(table.blockHeight),
    // Confirmation pass scan (only unconfirmed events)
    index('idx_vc_confirmed').on(table.confirmed)
      .where(sql`${table.confirmed} = false`),
  ]
);

// --- sync_state (polling checkpoint) ---

export const syncState = pgTable('sync_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: integer('label').notNull().unique(),
  lastBlockHeight: bigint('last_block_height', { mode: 'number' })
    .notNull()
    .default(0),
  lastBlockHash: text('last_block_hash'),
  lastTxHash: text('last_tx_hash'), // Diagnostic only
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
