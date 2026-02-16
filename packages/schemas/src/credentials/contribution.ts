import { z } from 'zod';
import { BaseCredentialSchema } from '../base.js';

/** Canonical contributionType enum — single source, consumed by UI and indexer (Audit Fix #6) */
export const ContributionTypeEnum = z.enum([
  'code',
  'design',
  'documentation',
  'review',
  'mentorship',
  'other',
]);

export type ContributionType = z.infer<typeof ContributionTypeEnum>;

/** ContributionCredential schema (per §7.5) */
export const ContributionCredentialSchema = BaseCredentialSchema.extend({
  vct: z.literal('ContributionCredential'),
  projectId: z.string().min(1),
  contributionType: ContributionTypeEnum,
  hours: z.number().positive().optional(),
  organization: z.string().min(1),
  description: z.string().optional(),
  evidenceUrl: z.string().url().optional(),
});

export type ContributionCredential = z.infer<typeof ContributionCredentialSchema>;

/** Fields that support selective disclosure for ContributionCredential */
export const contributionDisclosableFields = [
  'hours',
  'description',
  'evidenceUrl',
] as const;
