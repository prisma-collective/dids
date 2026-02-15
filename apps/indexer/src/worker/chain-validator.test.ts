import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateDIDChain } from './chain-validator.js';
import type { DIDEvent } from '@prisma-dids/types';

// Mock database
function createMockDb(queryResults: Record<string, any[]>) {
  const mockSelect = (fields: any) => ({
    from: () => ({
      where: () => ({
        limit: () => {
          // Return based on the query pattern
          // We'll use a simple counter to track calls
          const callIndex = mockSelect.callCount++;
          const keys = Object.keys(queryResults);
          const key = keys[callIndex] ?? keys[0] ?? '';
          return queryResults[key] ?? [];
        },
      }),
    }),
  });
  mockSelect.callCount = 0;

  return { select: mockSelect } as any;
}

const baseDID = 'did:cardano:stake_test1abc';

function makeEvent(overrides: Partial<DIDEvent> = {}): DIDEvent {
  return {
    id: baseDID,
    ipfs: 'QmTest123',
    action: 'create',
    v: 1,
    prev: null,
    payloadSig: '{}',
    ts: new Date().toISOString(),
    ...overrides,
  };
}

describe('validateDIDChain', () => {
  it('accepts a valid create event', async () => {
    const db = createMockDb({ existingCreate: [] });
    const event = makeEvent({ action: 'create', v: 1, prev: null });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(true);
  });

  it('rejects create with v != 1', async () => {
    const db = createMockDb({});
    const event = makeEvent({ action: 'create', v: 2, prev: null });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('create_version_not_1');
  });

  it('rejects create with non-null prev', async () => {
    const db = createMockDb({});
    const event = makeEvent({ action: 'create', v: 1, prev: 'tx_prev' });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('create_has_prev');
  });

  it('rejects duplicate create', async () => {
    const db = createMockDb({ existingCreate: [{ txHash: 'tx_existing' }] });
    const event = makeEvent({ action: 'create', v: 1, prev: null });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('duplicate_create');
  });

  it('rejects update with null prev', async () => {
    const db = createMockDb({});
    const event = makeEvent({ action: 'update', v: 2, prev: null });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('missing_prev');
  });

  it('rejects update with broken chain (unknown prev)', async () => {
    const db = createMockDb({ prevEvent: [], forkCheck: [] });
    const event = makeEvent({ action: 'update', v: 2, prev: 'tx_nonexistent' });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('broken_chain');
  });

  it('rejects update with version not increasing', async () => {
    const db = createMockDb({
      prevEvent: [{ version: 2, did: baseDID }],
      forkCheck: [],
    });
    const event = makeEvent({ action: 'update', v: 2, prev: 'tx_prev' });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('version_not_increasing');
  });

  it('detects fork (two events sharing same prev)', async () => {
    const db = createMockDb({
      prevEvent: [{ version: 1, did: baseDID }],
      forkCheck: [{ txHash: 'tx_conflicting' }],
    });
    const event = makeEvent({ action: 'update', v: 2, prev: 'tx_prev' });
    const result = await validateDIDChain(db, event, 'tx_abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('fork_detected');
  });
});
