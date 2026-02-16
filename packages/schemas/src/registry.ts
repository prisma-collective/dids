import type { ZodSchema } from 'zod';
import { ContributionCredentialSchema, contributionDisclosableFields } from './credentials/contribution.js';

export interface SchemaEntry {
  schema: ZodSchema;
  disclosableFields: readonly string[];
}

const schemaRegistry = new Map<string, SchemaEntry>();

export function registerSchema(
  vct: string,
  schema: ZodSchema,
  disclosableFields: readonly string[]
): void {
  schemaRegistry.set(vct, { schema, disclosableFields });
}

export function getSchema(vct: string): SchemaEntry | undefined {
  return schemaRegistry.get(vct);
}

export function listSchemas(): { vct: string; disclosableFields: readonly string[] }[] {
  return Array.from(schemaRegistry.entries()).map(([vct, entry]) => ({
    vct,
    disclosableFields: entry.disclosableFields,
  }));
}

// Pre-register built-in credential types
registerSchema('ContributionCredential', ContributionCredentialSchema, contributionDisclosableFields);
