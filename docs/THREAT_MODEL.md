# Threat Model — AI Agent Marketplace Contract

This document describes what an attacker, a dishonest marketplace participant,
or a malicious/compromised admin could do to the `ai-agent-marketplace`
Soroban contract, and how each risk is mitigated or explicitly accepted.

Scope: `contracts/ai-agent-marketplace/src/lib.rs`. The frontend, IPFS
storage and user wallets are covered only where they affect on-chain funds.

---

## 1. Assets

| Asset | Where it lives |
|-------|----------------|
| Escrowed USDC | Contract balance of the configured `usdc_token`, tracked per job in `Escrow` |
| Claimable balances | USDC owed to recipients without a trustline (`Claimable`) |
| Platform fees | Sent immediately to `platform_fee_recipient` |
| Reputation & reviews | `Agent.reputation`, `Review` entries |
| Configuration | `Config` (fees, resolver, caps, verifiers, timing windows) |
| Liveness | Contract instance storage TTL; pause flag |

## 2. Actors and trust assumptions

| Actor | Trust level | Assumption |
|-------|-------------|------------|
| Admin (`Config.admin`) | Highly trusted | A multisig on mainnet. Can change config, pause, manage denylist and verifiers, and resolve any dispute. Cannot be rotated on-chain. |
| Dispute resolver (`Config.dispute_resolver`) | Trusted | A multisig or DAO. Decides disputed escrows. |
| Skill verifiers | Semi-trusted | Added by admin; can only attach skill verifications. |
| Platform fee recipient | Passive | Receives fees; has no contract powers. |
| Client | Untrusted | Posts jobs, funds escrow, approves or disputes. |
| Agent owner | Untrusted | Registers an agent, bids, delivers, disputes, claims. |
| Anyone | Untrusted | Can call `bump_ttl` and read-only getters. |
| USDC token contract | Trusted | Fixed at `initialize`; expected to be the Stellar Asset Contract for Circle USDC. |

## 3. Fund flows

All USDC movement happens in the entrypoints below. There is no generic
withdraw or sweep entrypoint for the admin.

| Entrypoint | Caller | Flow |
|------------|--------|------|
| `accept_bid` | Client | Client → contract: `bid.amount + platform_fee`; contract → fee recipient: `platform_fee` |
| `approve_deliverable` | Client | Contract → agent: `escrow.amount` (or a claimable balance) |
| `resolve_dispute` | Resolver or admin | Contract → fee recipient: dispute fee; remainder to agent, client, or split |
| `resolve_dispute_fallback` | Client or agent, after `dispute_deadline` | Contract → fee recipient: dispute fee; remainder split `DISPUTE_FALLBACK_AGENT_PCT` / rest |
| `reclaim_expired_escrow` | Client, after `escrow_expiry_days` | Contract → client: `escrow.amount` |
| `reclaim_escrow` | Client, after the job deadline with no delivery | Contract → client: `escrow.amount` |
| `claim_funds` | Recorded recipient | Contract → recipient: the claimable amount |

Each flow requires `require_auth()` from the caller and checks the escrow
status (`Funded` or `Disputed`) before transferring, so a given escrow can only
be paid out once.

## 4. Admin capabilities

| Capability | Entrypoint | Effect |
|------------|------------|--------|
| Pause / unpause | `set_paused`, `pause`, `unpause` | Blocks every user entrypoint guarded by `ensure_not_paused`, including approvals, reclaims and `claim_funds` |
| Denylist | `add_to_denylist`, `remove_from_denylist` | Blocks `post_job` and `place_bid` for an address |
| Change fees | `update_config` | `platform_fee_bps` (≤ 10 000) and `platform_fee_bps_dispute` |
| Redirect fees | `update_config` | Change `platform_fee_recipient` |
| Replace resolver | `update_config` | Change `dispute_resolver` |
| Change timing | `update_config` | `dispute_window_days`, `escrow_expiry_days`, `max_job_deadline_days` |
| Change thresholds | `update_config` | `min_job_budget`, reputation thresholds, `require_skill_verification` |
| Manage verifiers | `add_skill_verifier`, `remove_skill_verifier`, `update_config` | Control who can verify skills |
| Resolve any dispute | `resolve_dispute` | Admin may resolve in place of the resolver |

The admin **cannot**: change `usdc_token`, change `admin`, move funds outside the
flows in §3, or edit jobs, bids, escrows or reviews directly.

## 5. Threats and mitigations

Each threat is marked **Mitigated** or **Accepted risk**.

### 5.1 Malicious or compromised admin

| # | Threat | Status | Mitigation / note |
|---|--------|--------|-------------------|
| A1 | Admin raises `platform_fee_bps_dispute` so disputed escrows pay mostly to the fee recipient | Accepted risk | Admin is a multisig; every change emits `config_upd`, which is monitored. Users can see the fee in `get_config` before funding. |
| A2 | Admin raises `platform_fee_bps` before a client accepts a bid | Mitigated | Bounded to 10 000 bps; the fee is computed and charged in the same `accept_bid` call the client signs, so the client approves the exact transfer amount. |
| A3 | Admin points `platform_fee_recipient` at an attacker | Accepted risk | Affects only future fees, never escrow principal. Multisig + event monitoring. |
| A4 | Admin resolves disputes in favour of one party | Accepted risk | Admin and resolver are trusted roles. Resolutions are public (`dispute_res` event) and auditable. |
| A5 | Admin swaps `dispute_resolver` mid-dispute to block the original resolver | Mitigated | If disputes are left unresolved, either party can call `resolve_dispute_fallback` once `dispute_deadline` passes. |
| A6 | Admin pauses indefinitely, freezing escrowed funds | Accepted risk | Pause is for incidents only (see the Incident Response section of the README); emits `pause`; multisig required. Funds remain in escrow, not transferable by admin. |
| A7 | Admin denylists a participant mid-job | Mitigated | The denylist only blocks `post_job` and `place_bid`; existing jobs can still be delivered, approved, disputed, reclaimed and claimed. |
| A8 | Admin shortens `dispute_window_days` or `escrow_expiry_days` | Accepted risk | Dispute deadlines are fixed on each dispute when raised. Changes are visible via `config_upd`. |
| A9 | Admin adds a colluding skill verifier | Accepted risk | `require_skill_verification` defaults to `false`; verifications are informational and public. |
| A10 | Admin key loss | Accepted risk | Admin cannot be rotated on-chain; multisig with documented key custody. Existing escrows can still be completed by users without the admin. |

### 5.2 Dishonest client

| # | Threat | Status | Mitigation / note |
|---|--------|--------|-------------------|
| C1 | Client never approves a delivered job | Mitigated | Agent raises a dispute within `dispute_window_days` of completion; if unresolved, `resolve_dispute_fallback` releases the split. |
| C2 | Client reclaims after the deadline even though work was delivered | Mitigated | `submit_deliverable` moves the job to `Completed`, and `reclaim_escrow` rejects completed jobs. |
| C3 | Client calls `reclaim_expired_escrow` after `escrow_expiry_days` on an unapproved delivery | Mitigated | Agent raises a dispute before expiry, which moves the escrow to `Disputed` so reclaim fails (`EscrowNotFunded`). |
| C4 | Client cancels after accepting a bid | Mitigated | `cancel_job` requires `JobStatus::Open`. |
| C5 | Client posts jobs it cannot fund | Mitigated | Funds are pulled in `accept_bid`; if the transfer fails the whole call reverts. |

### 5.3 Dishonest agent

| # | Threat | Status | Mitigation / note |
|---|--------|--------|-------------------|
| G1 | Agent submits a worthless deliverable | Mitigated | Client disputes within the window; only the deliverable hash is on-chain, evidence lives off-chain at `evidence_uri`. |
| G2 | Agent bids without a USDC trustline so payouts get stuck | Mitigated | `accept_bid` rejects unpayable agents; later payouts fall back to `Claimable` + `claim_funds`. |
| G3 | Agent bids on its own job | Mitigated | `place_bid` rejects `job.client == agent_owner`. |
| G4 | Agent submits duplicate bids | Mitigated | `BidAlreadyExists` check in `place_bid`. |

### 5.4 Disputes

| # | Threat | Status | Mitigation / note |
|---|--------|--------|-------------------|
| D1 | Resolver is unresponsive and funds lock forever | Mitigated | `resolve_dispute_fallback` after `dispute_deadline`. |
| D2 | A dispute is resolved twice | Mitigated | Both resolution paths require the dispute to be `Open`/`UnderReview` and set it to `Resolved`. |
| D3 | Third parties raise disputes | Mitigated | Only the job client or assigned agent may call `raise_dispute`. |
| D4 | Repeated disputes on the same job | Mitigated | `job.dispute_raised` blocks a second dispute. |
| D5 | Dispute fee is charged to the winning party | Accepted risk | Product decision; the fee is deducted from the escrow before any resolution. |

### 5.5 Platform and infrastructure

| # | Threat | Status | Mitigation / note |
|---|--------|--------|-------------------|
| P1 | Reentrancy through the token contract | Mitigated | The token is a fixed Stellar Asset Contract that cannot call back into the marketplace; failed transfers revert the invocation. |
| P2 | Malicious token contract | Mitigated | `usdc_token` is set once at `initialize` and cannot be changed. Deployers must verify the USDC SAC address. |
| P3 | Contract state expires (TTL) | Mitigated | Every entrypoint extends the instance TTL; `bump_ttl` plus `scripts/keeper.sh` keep idle escrows alive. |
| P4 | State growth raises per-call cost | Accepted risk | All entries live in instance storage, so cost grows with usage. Exposure caps limit growth during the canary phase; per-entrypoint budgets are tracked separately. |
| P5 | Large loss from an undiscovered bug | Mitigated | Canary caps: `max_job_budget` (10 000 USDC) and `max_total_escrow` (100 000 USDC) limit exposure; pause is available for incidents. |
| P6 | Reputation farming through self-dealing jobs | Accepted risk | Only job parties can review completed/refunded jobs; every fake job costs platform fees. |
| P7 | Bid front-running or copying | Accepted risk | Bids are public by design; the client chooses which bid to accept. |
| P8 | Denylisted (sanctioned) addresses transacting | Mitigated | Denylisted addresses cannot post jobs or bid. Off-chain screening is covered in the compliance section of the README. |
| P9 | Off-chain evidence or deliverables tampered with | Mitigated | `deliverable_hash` is stored on-chain; evidence URIs should point to content-addressed (IPFS) data. |
| P10 | User wallet compromise | Accepted risk | Out of scope for the contract; the frontend never handles private keys (Freighter signing). |

## 6. Review

| Role | Name | Date |
|------|------|------|
| Author | | |
| Second reviewer | | |

This document should be updated whenever an entrypoint, admin capability or
fund flow changes.
