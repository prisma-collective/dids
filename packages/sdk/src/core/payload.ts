import type { DidEventPayload } from '@prisma-dids/types';

export function buildCreatePayload(params: {
  did: string;
  ipfsCid: string;
}): DidEventPayload {
  return {
    id: params.did,
    ipfs: params.ipfsCid,
    action: 'create',
    v: 1,
    prev: null
  };
}

export function buildUpdatePayload(params: {
  did: string;
  ipfsCid: string;
  prevTxHash: string;
  version: number;
}): DidEventPayload {
  return {
    id: params.did,
    ipfs: params.ipfsCid,
    action: 'update',
    v: params.version,
    prev: params.prevTxHash
  };
}

export function buildRevokePayload(params: {
  did: string;
  ipfsCid: string;  // CID of DID doc with status: "revoked"
  prevTxHash: string;
  version: number;
}): DidEventPayload {
  return {
    id: params.did,
    ipfs: params.ipfsCid,
    action: 'revoke',
    v: params.version,
    prev: params.prevTxHash
  };
}
