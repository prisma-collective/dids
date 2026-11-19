import { describe, it, expect } from 'vitest';
import { encode as cborEncode } from 'cborg';
import { BaseAddress, Credential, PublicKey, Ed25519KeyHash } from '@emurgo/cardano-serialization-lib-nodejs';
import { ed25519 } from '../utils/crypto-setup.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '../utils/encoding.js';
import { deriveStakeAddressFromBaseAddress } from '../utils/stake.js';
import { verifyCoseSign1Signature } from './cose-verify.js';
import { verifyPinRequest } from './pin-auth.js';
import { pinIntentMessage, pinOwnerDid, signPinIntent } from './pin-intent.js';

// A synthetic wallet: a payment key, a testnet base address built from it,
// and a CIP-30 signData that returns a real CIP-8 COSE_Sign1.
async function makeWallet() {
  const secret = ed25519.utils.randomSecretKey();
  const pub = await ed25519.getPublicKeyAsync(secret);
  const paymentHash = PublicKey.from_bytes(pub).hash();
  const stakeHash = Ed25519KeyHash.from_bytes(crypto.getRandomValues(new Uint8Array(28)));
  const address = BaseAddress.new(0, Credential.from_keyhash(paymentHash), Credential.from_keyhash(stakeHash)).to_address();
  const addressHex = bytesToHex(address.to_bytes());
  const did = `did:cardano:${deriveStakeAddressFromBaseAddress(address.to_bech32())}`;
  return { secret, pub, addressHex, did };
}

async function coseSign(secret: Uint8Array, pub: Uint8Array, addressHex: string, payloadHex: string) {
  const protectedHeaders = cborEncode(new Map<unknown, unknown>([[1, -8], ['address', hexToBytes(addressHex)]]));
  const payload = hexToBytes(payloadHex);
  const toSign = cborEncode(['Signature1', protectedHeaders, new Uint8Array(0), payload]);
  const signature = await ed25519.signAsync(toSign, secret);
  return {
    signature: bytesToHex(cborEncode([protectedHeaders, new Map([['hashed', false]]), payload, signature])),
    key: bytesToHex(cborEncode(new Map<number, unknown>([[1, 1], [3, -8], [-1, 6], [-2, pub]]))),
  };
}

function walletApi(secret: Uint8Array, pub: Uint8Array) {
  return {
    signData: (address: string, payload: string) => coseSign(secret, pub, address, payload),
  } as any;
}

const didDocument = (did: string) => ({
  '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
  id: did,
  verificationMethod: [{ id: `${did}#key-1`, type: 'Ed25519VerificationKey2020', controller: did, publicKeyMultibase: 'z6Mk' }],
  authentication: [`${did}#key-1`],
});

describe('verifyCoseSign1Signature', () => {
  it('accepts a signature by the address\'s own payment key', async () => {
    const w = await makeWallet();
    const { signature, key } = await coseSign(w.secret, w.pub, w.addressHex, bytesToHex(utf8ToBytes('hello')));
    const result = await verifyCoseSign1Signature({ sig: signature, key, address: w.addressHex });
    expect(result.valid).toBe(true);
    expect(`did:cardano:${result.signerStakeAddress}`).toBe(w.did);
  });

  it('refuses a valid signature by another key that claims the address', async () => {
    const victim = await makeWallet();
    const attacker = await makeWallet();
    const { signature, key } = await coseSign(attacker.secret, attacker.pub, victim.addressHex, bytesToHex(utf8ToBytes('hello')));
    const result = await verifyCoseSign1Signature({ sig: signature, key, address: victim.addressHex });
    expect(result).toMatchObject({ valid: false, error: 'key_does_not_match_address' });
  });
});

describe('pinOwnerDid', () => {
  it('names the DID of a DID document, a revoked document and a credential envelope', () => {
    const did = 'did:cardano:stake_test1abc';
    expect(pinOwnerDid(didDocument(did))).toBe(did);
    expect(pinOwnerDid({ '@context': ['https://www.w3.org/ns/did/v1'], id: did, status: 'revoked', revokedAt: 'x' })).toBe(did);
    expect(pinOwnerDid({ credentialString: 'c', jti: 'j', vct: 'v', issuerDid: did, holderDid: 'did:cardano:h', issuedAt: 't' })).toBe(did);
  });

  it('refuses anything else', () => {
    const did = 'did:cardano:stake_test1abc';
    expect(pinOwnerDid({ abuse: 'arbitrary-unauthenticated-blob' })).toBeNull();
    expect(pinOwnerDid({ ...didDocument(did), extra: 'payload' })).toBeNull();
    expect(pinOwnerDid({ ...didDocument(did), id: 'did:web:example.com' })).toBeNull();
    expect(pinOwnerDid({ credentialString: 'c', jti: 'j', vct: 'v', issuerDid: did, holderDid: 'h', issuedAt: 't', more: 'x' })).toBeNull();
    expect(pinOwnerDid([didDocument(did)])).toBeNull();
  });
});

describe('verifyPinRequest', () => {
  it('passes the DID\'s own wallet pinning its document', async () => {
    const w = await makeWallet();
    const signed = await signPinIntent(walletApi(w.secret, w.pub), didDocument(w.did), w.addressHex);
    expect(await verifyPinRequest(JSON.parse(JSON.stringify(signed)))).toMatchObject({ ok: true, did: w.did });
  });

  it('refuses the review\'s proof of concept: arbitrary JSON, no signature', async () => {
    const res = await verifyPinRequest({ data: { abuse: 'arbitrary-unauthenticated-blob', sizeHint: 12345 } });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a DID document with no signature', async () => {
    const w = await makeWallet();
    expect(await verifyPinRequest({ data: didDocument(w.did) })).toMatchObject({ ok: false, status: 401 });
  });

  it('refuses a wallet pinning another DID\'s document', async () => {
    const w = await makeWallet();
    const other = await makeWallet();
    const signed = await signPinIntent(walletApi(w.secret, w.pub), didDocument(other.did), w.addressHex);
    expect(await verifyPinRequest(signed)).toMatchObject({ ok: false, status: 401 });
  });

  it('refuses a signature reused for other content', async () => {
    const w = await makeWallet();
    const signed = await signPinIntent(walletApi(w.secret, w.pub), didDocument(w.did), w.addressHex);
    const swapped = { ...signed, data: { ...didDocument(w.did), service: [{ id: `${w.did}#x`, type: 'X', serviceEndpoint: 'https://other.example' }] } };
    expect(await verifyPinRequest(swapped)).toMatchObject({ ok: false, status: 401 });
  });

  it('refuses an old signature', async () => {
    const w = await makeWallet();
    const signed = await signPinIntent(walletApi(w.secret, w.pub), didDocument(w.did), w.addressHex);
    const later = Date.parse(signed.ts) + 6 * 60 * 1000;
    expect(await verifyPinRequest(signed, later)).toMatchObject({ ok: false, status: 401 });
  });

  it('signs exactly the intent the server rebuilds', async () => {
    const w = await makeWallet();
    let seen = '';
    const api = { signData: async (a: string, p: string) => { seen = p; return coseSign(w.secret, w.pub, a, p); } } as any;
    const signed = await signPinIntent(api, didDocument(w.did), w.addressHex);
    expect(seen).toBe(bytesToHex(utf8ToBytes(await pinIntentMessage(didDocument(w.did), signed.ts))));
  });
});
