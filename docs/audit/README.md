# External Audit — AI Agent Marketplace Contract

The marketplace contract holds user funds in escrow and must be independently
reviewed before mainnet. This folder is the audit package handed to the
auditor and the record of findings through to resolution.

**Status:** Not yet engaged — no report received.

---

## 1. Audit package

| Item | Location |
|------|----------|
| Contract source (in scope) | [`contracts/ai-agent-marketplace/src/lib.rs`](../../contracts/ai-agent-marketplace/src/lib.rs) |
| Specification / API reference | [README — Contract API Reference](../../README.md#-contract-api-reference) |
| Configuration parameters | [README — Configuration](../../README.md#-configuration) |
| Threat model | [`docs/THREAT_MODEL.md`](../THREAT_MODEL.md) |
| Resource budgets | [`docs/BUDGETS.md`](../BUDGETS.md) |
| Tests | [`contracts/ai-agent-marketplace/src/test.rs`](../../contracts/ai-agent-marketplace/src/test.rs), [`budget_test.rs`](../../contracts/ai-agent-marketplace/src/budget_test.rs) |
| Deployment procedure | [`scripts/deploy-contract.sh`](../../scripts/deploy-contract.sh), [`scripts/init-contract.sh`](../../scripts/init-contract.sh) |

### Scope

- In scope: every public entrypoint of `AiAgentMarketplace` and its private
  helpers — escrow funding and release, disputes and the timeout fallback,
  claimable balances, reclaim paths, denylist, pause, config updates, skill
  verification, reviews and TTL handling.
- Out of scope: the frontend, IPFS storage, the USDC Stellar Asset Contract and
  the Soroban host itself.

### Commit under audit

Freeze a commit before the engagement starts and record it here. Changes made
after the freeze are reviewed as part of the fix review.

| Field | Value |
|-------|-------|
| Repository | `feyisaralawal/Bazaar` |
| Commit | _to be recorded at freeze_ |
| WASM SHA-256 (CI `contract-wasm` artifact) | _to be recorded at freeze_ |

### Test coverage

Generate a coverage report for the auditor with:

```bash
cd contracts/ai-agent-marketplace
cargo install cargo-llvm-cov
cargo llvm-cov --html
```

Attach the HTML report (`target/llvm-cov/html`) to the package.

## 2. Engagement process

1. Freeze the commit and record it above.
2. Send the package in §1 to shortlisted auditors (e.g. Trail of Bits,
   Certora, OtterSec, Veridise) and agree scope, timeline and fix-review terms.
3. Auditor delivers a preliminary report; findings are copied into §3.
4. Each finding gets a fix PR (or an accepted-risk rationale) and is re-reviewed
   by the auditor.
5. Auditor delivers the final report; it is committed to this folder as
   `report-<auditor>-<date>.pdf` and linked from the main README.
6. Mainnet deployment is blocked until every Critical and High finding is
   **Fixed** and verified by the auditor.

## 3. Findings tracker

| ID | Severity | Title | Status | Fix PR | Verified by auditor |
|----|----------|-------|--------|--------|---------------------|
| — | — | No findings yet | — | — | — |

Severity: Critical, High, Medium, Low, Informational.
Status: Open, Fixed, Acknowledged (accepted risk, with rationale), Won't fix.

## 4. Final report

| Auditor | Date | Commit | Report |
|---------|------|--------|--------|
| _pending_ | | | |
