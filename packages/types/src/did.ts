import { z } from 'zod';

// Exact payload per §3.2
export const DidEventPayloadSchema = z.object({
  id: z.string().startsWith('did:cardano:stake'),
  ipfs: z.string().startsWith('Qm'),
  action: z.enum(['create', 'update', 'revoke']),
  v: z.number().int().positive(),
  prev: z.string().nullable(),
});

// Exact payloadSig per §3.3.1
export const PrismaPayloadSigSchema = z.object({
  sig: z.string().regex(/^[0-9a-f]+$/i),  // hex Ed25519 signature
  key: z.string().regex(/^[0-9a-f]+$/i),  // hex Ed25519 public key
  address: z.string().regex(/^[0-9a-f]+$/i),  // hex-encoded address bytes (CIP-30 native)
});

// Full event (what goes in metadata)
export const DIDEventSchema = DidEventPayloadSchema.extend({
  payloadSig: z.string(),  // JSON.stringify(PrismaPayloadSig)
  ts: z.string().datetime(),
});

export type DidEventPayload = z.infer<typeof DidEventPayloadSchema>;
export type PrismaPayloadSig = z.infer<typeof PrismaPayloadSigSchema>;
export type DIDEvent = z.infer<typeof DIDEventSchema>;

// W3C DID Document types
export interface DIDDocument {
  '@context': string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  service?: Service[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase: string;
}

export interface Service {
  id: string;
  type: string;
  serviceEndpoint: string;
}
