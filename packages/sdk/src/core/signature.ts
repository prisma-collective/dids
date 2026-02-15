import type { CIP30API, DidEventPayload, PrismaPayloadSig, DIDEvent } from '@prisma-dids/types';
import { utf8ToBytes, bytesToHex } from '../utils/encoding.js';

/**
 * Signs a DID event payload using CIP-30 wallet per §3.3.1
 *
 * IMPORTANT: CIP-30 wallets expect hex-encoded payloads for signData.
 * We sign UTF-8 bytes encoded as hex, then verify against UTF-8 bytes.
 *
 * Browser-compatible: uses TextEncoder instead of Buffer.
 */
export async function signDIDPayload(
  wallet: CIP30API,
  payload: DidEventPayload,
  signingAddress: string  // base address (addr1...)
): Promise<PrismaPayloadSig> {
  // 1. Serialize payload deterministically
  const payloadStr = JSON.stringify(payload);

  // 2. Encode as hex for CIP-30 compatibility (browser-compatible)
  //    Most wallets expect hex-encoded data for signData
  const payloadBytes = utf8ToBytes(payloadStr);
  const payloadHex = bytesToHex(payloadBytes);

  // 3. Sign with CIP-30
  const { signature, key } = await wallet.signData(signingAddress, payloadHex);

  // 4. Return exact format per §3.3.1
  return {
    sig: signature,
    key,
    address: signingAddress
  };
}

/**
 * Constructs final DIDEvent for metadata
 */
export function buildDIDEvent(
  payload: DidEventPayload,
  payloadSig: PrismaPayloadSig
): DIDEvent {
  return {
    ...payload,
    payloadSig: JSON.stringify(payloadSig),
    ts: new Date().toISOString()
  };
}
