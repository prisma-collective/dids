import { describe, it, expect, vi } from 'vitest';
import { buildCreatePayload, buildUpdatePayload, buildRevokePayload } from './payload.js';
import { signDIDPayload, buildDIDEvent } from './signature.js';
import { serializeDIDMetadata } from '../tx/metadata.js';
import { DIDEventSchema, DidEventPayloadSchema } from '@prisma-events/dids-types';
import { L_DID } from '@prisma-events/dids-types';
import type { CIP30API, DIDEvent } from '@prisma-events/dids-types';

/**
 * SDK-level E2E: exercises the full create → update → revoke data pipeline
 * with a mocked CIP-30 wallet. Validates that every function in the chain
 * produces correct data that the next function accepts.
 */
describe('DID Lifecycle E2E (SDK)', () => {
  const TEST_DID = 'did:cardano:stake_test1uzpq2pktg7p6t8khs9r8w6vq4jm0p4d2';
  const TEST_IPFS_V1 = 'QmCreateCID111111111111111111111111111111111111';
  const TEST_IPFS_V2 = 'QmUpdateCID222222222222222222222222222222222222';
  const TEST_IPFS_REVOKE = 'QmRevokeCID33333333333333333333333333333333333';
  const TEST_ADDRESS = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
  const CREATE_TX_HASH = 'aa'.repeat(32);
  const UPDATE_TX_HASH = 'bb'.repeat(32);

  // Mock CIP-30 wallet — signData returns fake hex sig/key
  const mockWallet: CIP30API = {
    signData: vi.fn().mockResolvedValue({
      signature: 'cc'.repeat(64),
      key: 'dd'.repeat(32),
    }),
    signTx: vi.fn(),
    submitTx: vi.fn(),
    getUsedAddresses: vi.fn(),
    getChangeAddress: vi.fn(),
    getBalance: vi.fn(),
    getUtxos: vi.fn(),
    getNetworkId: vi.fn(),
    getCollateral: vi.fn(),
  } as unknown as CIP30API;

  // Shared state across sequential tests
  let createPayload: ReturnType<typeof buildCreatePayload>;
  let createEvent: DIDEvent;
  let updatePayload: ReturnType<typeof buildUpdatePayload>;
  let updateEvent: DIDEvent;
  let revokePayload: ReturnType<typeof buildRevokePayload>;
  let revokeEvent: DIDEvent;

  it('buildCreatePayload → action=create, v=1, prev=null', () => {
    createPayload = buildCreatePayload({ did: TEST_DID, ipfsCid: TEST_IPFS_V1 });

    expect(createPayload).toEqual({
      id: TEST_DID,
      ipfs: TEST_IPFS_V1,
      action: 'create',
      v: 1,
      prev: null,
    });
    expect(DidEventPayloadSchema.safeParse(createPayload).success).toBe(true);
  });

  it('signDIDPayload → calls wallet.signData, returns PrismaPayloadSig', async () => {
    const sig = await signDIDPayload(mockWallet, createPayload, TEST_ADDRESS);

    expect(mockWallet.signData).toHaveBeenCalledOnce();
    expect(sig).toHaveProperty('sig');
    expect(sig).toHaveProperty('key');
    expect(sig.address).toBe(TEST_ADDRESS);
  });

  it('buildDIDEvent → merges payload + sig + timestamp into valid DIDEvent', async () => {
    const sig = await signDIDPayload(mockWallet, createPayload, TEST_ADDRESS);
    createEvent = buildDIDEvent(createPayload, sig);

    expect(createEvent.id).toBe(TEST_DID);
    expect(createEvent.action).toBe('create');
    expect(createEvent.v).toBe(1);
    expect(createEvent.prev).toBeNull();
    expect(JSON.parse(createEvent.payloadSig)).toEqual(sig);
    expect(DIDEventSchema.safeParse(createEvent).success).toBe(true);
  });

  it('serializeDIDMetadata → wraps under L_DID, chunks long strings', () => {
    const metadata = serializeDIDMetadata(createEvent);

    expect(metadata).toHaveProperty(String(L_DID));
    const inner = metadata[L_DID] as Record<string, unknown>;
    expect(inner.id).toBe(TEST_DID);
    expect(inner.action).toBe('create');

    // payloadSig is >64 chars, so it must be chunked into an array
    expect(Array.isArray(inner.payloadSig)).toBe(true);
    const reassembled = (inner.payloadSig as string[]).join('');
    expect(reassembled).toBe(createEvent.payloadSig);
  });

  it('buildUpdatePayload → action=update, v=2, prev=createTxHash', () => {
    updatePayload = buildUpdatePayload({
      did: TEST_DID,
      ipfsCid: TEST_IPFS_V2,
      prevTxHash: CREATE_TX_HASH,
      version: 2,
    });

    expect(updatePayload).toEqual({
      id: TEST_DID,
      ipfs: TEST_IPFS_V2,
      action: 'update',
      v: 2,
      prev: CREATE_TX_HASH,
    });
    expect(DidEventPayloadSchema.safeParse(updatePayload).success).toBe(true);
  });

  it('full update cycle: sign + build event → valid DIDEvent', async () => {
    const sig = await signDIDPayload(mockWallet, updatePayload, TEST_ADDRESS);
    updateEvent = buildDIDEvent(updatePayload, sig);

    expect(updateEvent.action).toBe('update');
    expect(updateEvent.v).toBe(2);
    expect(updateEvent.prev).toBe(CREATE_TX_HASH);
    expect(DIDEventSchema.safeParse(updateEvent).success).toBe(true);
  });

  it('buildRevokePayload → action=revoke, v=3, prev=updateTxHash', () => {
    revokePayload = buildRevokePayload({
      did: TEST_DID,
      ipfsCid: TEST_IPFS_REVOKE,
      prevTxHash: UPDATE_TX_HASH,
      version: 3,
    });

    expect(revokePayload).toEqual({
      id: TEST_DID,
      ipfs: TEST_IPFS_REVOKE,
      action: 'revoke',
      v: 3,
      prev: UPDATE_TX_HASH,
    });
    expect(DidEventPayloadSchema.safeParse(revokePayload).success).toBe(true);
  });

  it('all events share same DID, produce valid JSON, schemas validate', async () => {
    const sig = await signDIDPayload(mockWallet, revokePayload, TEST_ADDRESS);
    revokeEvent = buildDIDEvent(revokePayload, sig);

    // All three events share the same DID
    const events = [createEvent, updateEvent, revokeEvent];
    for (const event of events) {
      expect(event.id).toBe(TEST_DID);
      expect(DIDEventSchema.safeParse(event).success).toBe(true);
    }

    // Versions are monotonically increasing
    expect(events.map((e) => e.v)).toEqual([1, 2, 3]);

    // Actions follow lifecycle order
    expect(events.map((e) => e.action)).toEqual(['create', 'update', 'revoke']);

    // Each event serializes to valid metadata
    for (const event of events) {
      const metadata = serializeDIDMetadata(event);
      expect(metadata).toHaveProperty(String(L_DID));
    }
  });
});
