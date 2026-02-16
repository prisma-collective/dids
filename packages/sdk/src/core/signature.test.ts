import { describe, it, expect, vi } from 'vitest';
import { signDIDPayload, buildDIDEvent } from './signature.js';
import type { DidEventPayload, PrismaPayloadSig } from '@prisma-dids/types';

// ─── Helpers ───

function createMockWallet(overrides: Record<string, unknown> = {}) {
  return {
    signData: vi.fn().mockResolvedValue({
      signature: 'aa'.repeat(64),
      key: 'bb'.repeat(32),
    }),
    ...overrides,
  };
}

const TEST_ADDRESS = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';

const TEST_PAYLOAD: DidEventPayload = {
  id: 'did:cardano:stake_test1uzcontroller',
  ipfs: 'QmTestCID123abc',
  action: 'create',
  v: 1,
  prev: null,
};

// ─── signDIDPayload ───

describe('signDIDPayload', () => {
  it('should return PrismaPayloadSig with correct shape', async () => {
    const wallet = createMockWallet();
    const result = await signDIDPayload(wallet as any, TEST_PAYLOAD, TEST_ADDRESS);

    expect(result).toHaveProperty('sig');
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('address');
  });

  it('should pass hex-encoded payload to wallet.signData', async () => {
    const wallet = createMockWallet();
    await signDIDPayload(wallet as any, TEST_PAYLOAD, TEST_ADDRESS);

    expect(wallet.signData).toHaveBeenCalledOnce();
    const [addr, hexPayload] = wallet.signData.mock.calls[0]!;
    expect(addr).toBe(TEST_ADDRESS);
    // Hex string: only hex chars, even length
    expect(hexPayload).toMatch(/^[0-9a-f]+$/);
    expect(hexPayload.length % 2).toBe(0);
  });

  it('should encode JSON.stringify of the payload as hex', async () => {
    const wallet = createMockWallet();
    await signDIDPayload(wallet as any, TEST_PAYLOAD, TEST_ADDRESS);

    const [, hexPayload] = wallet.signData.mock.calls[0]!;
    // Decode hex to string to verify it matches JSON.stringify
    const bytes = new Uint8Array(
      (hexPayload as string).match(/.{2}/g)!.map((b: string) => parseInt(b, 16))
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe(JSON.stringify(TEST_PAYLOAD));
  });

  it('should return the signing address in the result', async () => {
    const wallet = createMockWallet();
    const result = await signDIDPayload(wallet as any, TEST_PAYLOAD, TEST_ADDRESS);

    expect(result.address).toBe(TEST_ADDRESS);
  });

  it('should propagate wallet signData rejection', async () => {
    const wallet = createMockWallet({
      signData: vi.fn().mockRejectedValue(new Error('user_declined')),
    });

    await expect(
      signDIDPayload(wallet as any, TEST_PAYLOAD, TEST_ADDRESS)
    ).rejects.toThrow('user_declined');
  });
});

// ─── buildDIDEvent ───

describe('buildDIDEvent', () => {
  const TEST_SIG: PrismaPayloadSig = {
    sig: 'aa'.repeat(64),
    key: 'bb'.repeat(32),
    address: TEST_ADDRESS,
  };

  it('should spread payload fields into result', () => {
    const event = buildDIDEvent(TEST_PAYLOAD, TEST_SIG);

    expect(event.id).toBe(TEST_PAYLOAD.id);
    expect(event.ipfs).toBe(TEST_PAYLOAD.ipfs);
    expect(event.action).toBe(TEST_PAYLOAD.action);
    expect(event.v).toBe(TEST_PAYLOAD.v);
    expect(event.prev).toBe(TEST_PAYLOAD.prev);
  });

  it('should JSON-stringify payloadSig', () => {
    const event = buildDIDEvent(TEST_PAYLOAD, TEST_SIG);

    const parsed = JSON.parse(event.payloadSig);
    expect(parsed.sig).toBe(TEST_SIG.sig);
    expect(parsed.key).toBe(TEST_SIG.key);
    expect(parsed.address).toBe(TEST_SIG.address);
  });

  it('should add ts as valid ISO datetime', () => {
    const event = buildDIDEvent(TEST_PAYLOAD, TEST_SIG);

    expect(event.ts).toBeDefined();
    const parsed = new Date(event.ts);
    expect(parsed.getTime()).not.toBeNaN();
    // Should be recent (within last 5 seconds)
    expect(Date.now() - parsed.getTime()).toBeLessThan(5000);
  });

  it('should not mutate original payload', () => {
    const original = { ...TEST_PAYLOAD };
    buildDIDEvent(TEST_PAYLOAD, TEST_SIG);

    expect(TEST_PAYLOAD).toEqual(original);
  });
});
