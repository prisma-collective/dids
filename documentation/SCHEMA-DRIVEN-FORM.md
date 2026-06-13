# Schema-Driven Issuance Form

## Context

The issuance form in `apps/vc-interface/components/IssuanceForm.tsx` has a hardcoded `credentialFields` object that duplicates field names, types, labels, and enum options from the Zod schema in `packages/schemas`. If someone changes the Zod schema, the form breaks because it renders stale fields. The goal is to derive the form fields at runtime from the Zod schema so the UI always matches.

---

## Approach

Create an introspection utility in `packages/schemas` that reads a Zod schema's `.shape` at runtime, detects field types (`ZodString`, `ZodNumber`, `ZodEnum`, `ZodOptional`), and produces form field definitions. The issuance form replaces its hardcoded constant with a call to this utility.

---

## Step 1: Add introspection utility

**New file:** `packages/schemas/src/introspect.ts`

Exports a single function `deriveFormFields(schema, disclosableFields, labelOverrides?)` that:
- Iterates `Object.keys(schema.shape)`
- Skips base fields (`iss`, `sub`, `jti`, `iat`, `exp`, `vct`)
- For each remaining field, checks `._def.typeName` to determine:
  - `ZodOptional` unwrap inner type, mark `required: false`
  - `ZodEnum` input type `select`, extract `._def.values` as options
  - `ZodNumber` input type `number`
  - `ZodString` input type `text`
- Sets `canDisclose` from the `disclosableFields` array
- Derives a label from the key via camelCase splitting (e.g. `projectId` becomes `Project Id`), with optional overrides for cases like `Project ID` or `Evidence URL`
- Returns `Array<{ key, label, type, required, options?, canDisclose, defaultDisclosed }>`

---

## Step 2: Add label overrides and default-disclosed metadata to the credential definition

**Modify:** `packages/schemas/src/credentials/contribution.ts`

Add and export:
```ts
export const contributionLabelOverrides: Record<string, string> = {
  projectId: 'Project ID',
  contributionType: 'Contribution Type',
  evidenceUrl: 'Evidence URL',
};

export const contributionDefaultDisclosed = ['description'] as const;
```

---

## Step 3: Extend the schema registry to carry UI metadata

**Modify:** `packages/schemas/src/registry.ts`

Update `SchemaEntry` and `registerSchema` to accept optional `labelOverrides` and `defaultDisclosed`:

```ts
export interface SchemaEntry {
  schema: ZodObject<any>;
  disclosableFields: readonly string[];
  labelOverrides?: Record<string, string>;
  defaultDisclosed?: readonly string[];
}
```

Update the `ContributionCredential` registration call to include the new metadata.

---

## Step 4: Export from the package index

**Modify:** `packages/schemas/src/index.ts`

Add exports for `deriveFormFields`, the new metadata from contribution.ts, and the updated `SchemaEntry` type.

---

## Step 5: Replace hardcoded fields in IssuanceForm

**Modify:** `apps/vc-interface/components/IssuanceForm.tsx`

- Remove the entire `credentialFields` constant (lines 35-62)
- Import `getSchema`, `deriveFormFields`, `listSchemas` from `@prisma-events/dids-schemas`
- Derive available credential types from `listSchemas()` instead of the hardcoded `CredentialType` union
- Replace `credentialFields[credentialType]` with `deriveFormFields(entry.schema, entry.disclosableFields, entry.labelOverrides, entry.defaultDisclosed)`
- The rest of the JSX (select/number/text rendering, disclosure toggles) stays the same since the derived field shape matches the current one

---

## Step 6: Clean up CredentialType

**Modify:** `apps/vc-interface/types/vc.ts`

`MembershipCredential` and `AchievementCredential` have no Zod schemas and are not registered. Two options:
- Remove them from the type union (they were placeholder types with no backing schema)
- Or keep the union but only render types that exist in the registry

Recommended: remove them since the form will now only show registered types.

---

## Step 7: Update docs

**Modify:** `README.md` and `documentation/API.md`

Update the "Modifying the Credential Schema" sections to remove the warning about updating IssuanceForm.tsx manually, since the form now derives fields automatically.

---

## Files summary

| File | Change |
|------|--------|
| `packages/schemas/src/introspect.ts` | New: `deriveFormFields` utility |
| `packages/schemas/src/credentials/contribution.ts` | Add label overrides and default-disclosed exports |
| `packages/schemas/src/registry.ts` | Extend `SchemaEntry` with UI metadata |
| `packages/schemas/src/index.ts` | Export new utilities |
| `apps/vc-interface/components/IssuanceForm.tsx` | Replace hardcoded `credentialFields` with `deriveFormFields()` call |
| `apps/vc-interface/types/vc.ts` | Remove phantom credential types |
| `README.md` | Update schema modification docs |
| `documentation/API.md` | Update schema modification docs |

## Verification

1. `cd packages/schemas && npx vitest run` (if tests exist) or `npx tsc --noEmit`
2. `cd apps/vc-interface && npx tsc --noEmit` to type-check the form
3. Manually verify: changing a field in `contribution.ts` should automatically appear in the issuance form without touching `IssuanceForm.tsx`
