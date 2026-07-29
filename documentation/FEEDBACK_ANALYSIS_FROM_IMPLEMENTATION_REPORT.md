# Pilot Feedback Analysis — DIDs for Roles, Authentication & Access Management

**Related report:** M3B — Pilot Implementation Report
**Scope:** Feedback gathered from pilot test cases on the `enrol` (register.prisma.events) and `docs-secret` applications, and the resulting product adaptations.

---

## 1. DID issuance as a mandatory enrolment step introduces friction

**Context:** Role issuance in the pilot runs through event-scoped enrolment on `register.prisma.events`. As implemented, general participants enrolling into an Action Learning Journey event were required to complete DID issuance (wallet-linked, on-chain) as a blocking step of that enrolment flow before their registration could be considered complete.

**Test case observation:** For general participants — who are typically not crypto-native and are enrolling primarily to attend an in-person event — being stopped mid-enrolment to complete an on-chain DID issuance step reduced completion rates and added avoidable friction to what should be a quick sign-up.

**Product adaptation:** DID issuance is decoupled from the core enrolment step. A participant's DID-issuance preference is captured and stored in a backlog at enrolment time, and the user is prompted to complete DID issuance at a later stage (e.g. closer to the event, or when they first need role-gated access). This preserves the event-scoped role model described in the report while removing DID issuance from the critical path of enrolment.

---

## 2. Requiring a wallet at enrolment introduces friction

**Context:** The authentication flow across both pilots is wallet-native: a CIP-30 wallet proves control of a stake key, which is mapped to a `did:cardano:{stakeAddress}` and resolved via the DID indexer. In the current `enrol` flow, having a connected Cardano wallet was a precondition for creating a profile/enrolling.

**Test case observation:** Requiring participants to already hold and connect a Cardano wallet before they can even create a profile is a significant barrier for first-time or non-technical users, and was flagged as a drop-off point during enrolment testing.

**Product adaptation:** The team is exploring a partnership on a Cardano-based non-custodial wallet to streamline profile creation during enrolment — allowing a wallet to be provisioned as part of the enrolment experience itself, rather than requiring the user to source and connect one beforehand. This keeps the wallet → DID → role resolution path intact while lowering the barrier to entry for general users.

---

## 3. Wallet-connect guidance for content unlock is non-intuitive

**Context:** In the Docs pilot, private/role-gated pages are unlocked client-side via `PrivatePageShell`, which triggers the CIP-30 `enable()` + `did-prepare` + `verify` flow to obtain a session token before serving full page content.

**Test case observation:** Users testing the "unlock this content" prompt on private docs pages found the wallet-connect call to action unclear — it wasn't obvious that connecting a wallet was the mechanism for unlocking gated knowledge content, leading to confusion or abandonment at the lock screen.

**Product adaptation:** The wallet-connect guidance message on private pages is being made more verbose and explicit about what the action does and why, and now links out to tutorial resources for users unfamiliar with connecting a Cardano wallet.

---

## Summary

| # | Feedback | Adaptation | Status |
|---|----------|------------|--------|
| 1 | DID issuance blocking enrolment | Defer to backlog, prompt post-enrolment | Incorporated |
| 2 | Wallet required at enrolment | Explore non-custodial wallet partnership for in-flow provisioning | In progress |
| 3 | Wallet-connect unlock UX unclear | More verbose guidance + tutorial links | Incorporated |

This feedback was gathered from pilot test cases on the `enrol` and `docs-secret` applications and has been incorporated into the product per Milestone B1.
