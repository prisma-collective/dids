// Base credential types
export { BaseCredentialSchema, type BaseCredential } from './base.js';

// VC on-chain event schema
export { VCEventPayloadSchema, type VCEventPayload, L_VC } from './vc-event.js';

// Credential schemas
export {
  ContributionCredentialSchema,
  ContributionTypeEnum,
  contributionDisclosableFields,
  type ContributionCredential,
  type ContributionType,
} from './credentials/contribution.js';

// Schema registry
export { registerSchema, getSchema, listSchemas, type SchemaEntry } from './registry.js';
