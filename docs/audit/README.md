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

### Behavioural notes for the fix review

The following behaviours changed after the initial package was assembled and
must be reviewed as part of the fix review (see §3):

- **Pause matrix (#118).** `set_paused` no longer blocks settlement-type
  entrypoints. While paused, `approve_deliverable`, `raise_dispute`,
  `resolve_dispute`, `withdraw_bid`, `leave_review`, `claim_balance` and the
  reclaim/refund paths remain callable so escrowed funds can always be
  released; only growth entrypoints (`create_job`, `register_agent`,
  `place_bid`, `update_config`, `verify_skill`, …) are blocked. The full
  matrix is documented in the contract API reference and covered by a
  table-driven test over every entrypoint.
- **Cold-start reputation policy (#119).** `register_agent` assigns a
  configurable starting reputation (`config.starting_reputation`, default 0),
  and `place_bid` exempts agents with zero completed jobs from
  `min_agent_reputation_to_bid`, so a new agent can always place a first bid
  under the default configuration.
- **Reputation derivation (#120).** `Agent` stores `rating_sum` and
  `rating_count`; reputation is derived as
  `round(rating_sum * 20 / rating_count)` (0 when `rating_count == 0`) rather
  than a lossy rolling integer average, so it no longer depends on
  `ReviewsByReviewee.len()` and does not accumulate rounding error.
- **Dispute settlement (#117).** `resolve_dispute` and `approve_deliverable`
  share a `finalize_job_payout` helper, so agent earnings,
  `total_jobs_completed`, platform stats and `job.completed_at` are updated
  identically on both paths.
=======

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
| #117 | Medium | `resolve_dispute` does not update agent stats, completion time or reputation inputs | Fixed | Shared `finalize_job_payout` helper; test comparing both paths | _pending_ |
| #118 | Medium | Emergency pause can trap funds | Fixed | Documented pause matrix; table-driven test over every entrypoint | _pending_ |
| #119 | Medium | Cold-start: new agents with reputation 0 cannot bid when `min_agent_reputation_to_bid > 0` | Fixed | Configurable starting reputation + zero-completed-jobs exemption; policy documented | _pending_ |
| #120 | Low | Reputation is a lossy rolling integer average | Fixed | `rating_sum`/`rating_count` on `Agent`; reputation = `round(sum*20/count)`; property test | _pending_ |
=======

Severity: Critical, High, Medium, Low, Informational.
Status: Open, Fixed, Acknowledged (accepted risk, with rationale), Won't fix.

## 4. Final report

| Auditor | Date | Commit | Report |
|---------|------|--------|--------|
| _pending_ | | | |
