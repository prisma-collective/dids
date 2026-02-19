-- Phase 6: Replace single-column VC indexes with composite partial indexes
-- These match the API query patterns (WHERE + ORDER BY) for index-ordered scans.

-- Drop old single-column indexes (subsumed by composites)
DROP INDEX IF EXISTS "idx_vc_hash";
DROP INDEX IF EXISTS "idx_vc_issuer_did";
DROP INDEX IF EXISTS "idx_vc_holder_did";

-- vcHash lookups: /vc/:vcHash and /vc/:vcHash/status endpoints
-- Covers ORDER BY (block_height, tx_index, tx_hash) fully
CREATE INDEX "idx_vc_hash_status" ON "vc_events" ("vc_hash", "block_height", "tx_index", "tx_hash")
  WHERE "valid" = true;

-- Issuer credential list: /issuer/:did/credentials
CREATE INDEX "idx_vc_issuer_creds" ON "vc_events" ("issuer_did", "block_height", "tx_index", "tx_hash")
  WHERE "event" = 'issue' AND "valid" = true;

-- Holder credential list: /holder/:did/credentials
CREATE INDEX "idx_vc_holder_creds" ON "vc_events" ("holder_did", "block_height", "tx_index", "tx_hash")
  WHERE "event" = 'issue' AND "valid" = true;
