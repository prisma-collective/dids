import { z } from 'zod';

/** Base credential schema shared by all credential types (per §7.4) */
export const BaseCredentialSchema = z.object({
  /** Issuer DID */
  iss: z.string().startsWith('did:cardano:'),
  /** Holder DID (subject) */
  sub: z.string().startsWith('did:cardano:'),
  /** Unique identifier — urn:uuid format */
  jti: z.string().regex(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  /** Issued-at unix timestamp */
  iat: z.number().int().positive(),
  /** Expiration unix timestamp (optional) */
  exp: z.number().int().positive().optional(),
  /** Credential type discriminator (e.g., 'ContributionCredential') */
  vct: z.string().min(1),
});

export type BaseCredential = z.infer<typeof BaseCredentialSchema>;
