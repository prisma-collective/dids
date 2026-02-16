# Testing Checklist — Prisma DIDs

Manual testing procedures for Preprod. Run after any change to DID lifecycle code.

---

## C.3 — Update DID on Preprod

### Prerequisites

- [ ] CIP-30 wallet connected (Nami, Eternl, or Lace) with Preprod tADA
- [ ] Dashboard running locally (`pnpm --filter dashboard dev`)
- [ ] Indexer online (Railway or local) and reachable via `INDEXER_URL_PREPROD`
- [ ] A DID already created on Preprod (v=1 confirmed)

### Steps

1. Open the Dashboard and navigate to your existing DID
2. Click **Update DID** (or equivalent action button)
3. Modify the DID document (e.g., add a new service endpoint or update IPFS content)
4. Confirm the transaction in your wallet — expect a CIP-30 `signData` popup followed by a `signTx` popup
5. Wait for the transaction to appear on-chain (~20-60 seconds on Preprod)
6. Refresh the Dashboard or wait for the indexer to poll

### Expected Outcomes

- [ ] Transaction submitted successfully (tx hash visible in wallet/explorer)
- [ ] Metadata contains label `199674` with `action: "update"`, `v: 2`, `prev: <create_tx_hash>`
- [ ] New IPFS CID is different from the create CID
- [ ] Indexer picks up the event within 1-2 polling cycles
- [ ] `GET /api/did/{did}` returns the updated DID document
- [ ] `GET /api/did/{did}/history` shows both create (v=1) and update (v=2) events
- [ ] Both events marked `valid: true`

### Failure Cases to Watch

- Wallet rejects signing → transaction never submitted (check wallet logs)
- Metadata exceeds 16KB → SDK throws before submission
- Wrong `prev` tx hash → indexer marks event as `broken_chain`
- Version not incremented → indexer marks event as `version_not_increasing`

---

## C.4 — Revoke DID on Preprod

### Prerequisites

- [ ] All prerequisites from C.3 met
- [ ] Update transaction from C.3 is confirmed on-chain
- [ ] DID has at least one update (v ≥ 2) — or at minimum a confirmed create (v=1)

### Steps

1. Open the Dashboard and navigate to your existing DID
2. Click **Revoke DID** (or equivalent action button)
3. Confirm the revocation in the confirmation modal
4. Confirm the transaction in your wallet — expect `signData` + `signTx` popups
5. Wait for the transaction to appear on-chain
6. Refresh the Dashboard or wait for the indexer to poll

### Expected Outcomes

- [ ] Transaction submitted successfully
- [ ] Metadata contains label `199674` with `action: "revoke"`, `v: 3` (or v=prev+1), `prev: <update_tx_hash>`
- [ ] IPFS CID points to a DID document with revocation status
- [ ] Indexer picks up the event within 1-2 polling cycles
- [ ] `GET /api/did/{did}` returns 410 Gone (or equivalent revoked status)
- [ ] `GET /api/did/{did}/history` shows create → update → revoke chain
- [ ] All events marked `valid: true`, versions monotonically increasing

### Post-Revoke Validation

- [ ] Attempting to update the revoked DID fails gracefully in the Dashboard UI
- [ ] Attempting to revoke again fails gracefully (already revoked)
- [ ] The DID resolver returns the revoked status, not the last active document

### Failure Cases to Watch

- Missing `prev` pointer → indexer marks as `missing_prev`
- Wrong signer (different wallet) → indexer marks as `signer_not_controller`
- Fork attempt (using old prev) → indexer marks as `fork_detected`
