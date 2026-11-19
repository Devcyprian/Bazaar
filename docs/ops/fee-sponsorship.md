# Fee Sponsorship (Fee-Bump) Design

Users who only deal in USDC should not need to hold XLM for network fees. This
document evaluates platform-paid fees via
[fee-bump transactions](https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/fee-bump-transactions),
describes the testnet prototype, its cost model and the abuse limits.

## How it works

1. The frontend builds and prepares the contract call as usual
   (`invokeContractWrite` in `src/contexts/StellarContext.tsx`) and the user
   signs it with Freighter.
2. When `VITE_FEE_SPONSOR_URL` is set, the signed XDR is posted to the sponsor
   endpoint (`frontend/ai-agent-marketplace/api/fee-bump.ts`, deployed as a
   Vercel function at `/api/fee-bump`).
3. The endpoint validates the transaction against the abuse limits, wraps it in
   a fee-bump transaction whose fee source is the platform sponsor account,
   signs it and submits it to Soroban RPC.
4. The frontend polls the returned hash exactly like a user-paid transaction.
5. If the sponsor declines (disabled, misconfigured, rate limited or out of
   budget) the frontend falls back to submitting the transaction itself, so the
   user pays the fee as before.

The user's signature still authorizes the inner transaction; the sponsor only
pays the fee and cannot change the operations.

### What is not covered

Fee bumps only pay **transaction fees**. Accounts still need the minimum
balance: 1 XLM base reserve (2 × 0.5 XLM) plus 0.5 XLM for the USDC trustline.
Covering reserves needs
[sponsored reserves](https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/sponsored-reserves)
at onboarding and is out of scope for this prototype.

## Cost model

A fee-bumped Soroban transaction costs the sponsor:

```
sponsor cost = resource fee (inner transaction) + fee-bump inclusion fee
fee-bump inclusion fee = 200 stroops × (operations + 1) = 400 stroops for one call
```

- **Resource fee** — set by `prepareTransaction` from simulation (CPU,
  memory, ledger reads/writes, events, rent). It depends on the method and on
  how much state it touches. Read it from the `minResourceFee` of a simulation
  of each method; on testnet, marketplace calls typically land between
  0.005 and 0.05 XLM (50,000–500,000 stroops), with writes that create new
  ledger entries (`post_job`, `place_bid`, `accept_bid`) at the high end because
  of rent.
- **Inclusion fee** — 400 stroops (0.00004 XLM) per transaction at the
  prototype's 200-stroop rate. It only rises above that if the network is in
  surge pricing and the rate is raised.

Monthly cost estimate:

```
monthly XLM = transactions per day × 30 × average sponsor cost per transaction
```

| Daily sponsored txs | Avg cost / tx | Monthly cost |
| --- | --- | --- |
| 100 | 0.02 XLM | 60 XLM |
| 1,000 | 0.02 XLM | 600 XLM |
| 10,000 | 0.02 XLM | 6,000 XLM |

Multiply by the XLM/USD price to budget in fiat. The daily budget cap below
bounds the worst case at `FEE_SPONSOR_DAILY_BUDGET_STROOPS × 30`
(1,500 XLM/month at the default 50 XLM/day).

## Abuse limits

Enforced by `api/fee-bump.ts` before anything is signed:

| Limit | Default | Env var |
| --- | --- | --- |
| Kill switch | off | `FEE_SPONSOR_ENABLED=true` to enable |
| Allowed calls | one `invokeContract` operation targeting the marketplace contract | `CONTRACT_ID` / `VITE_CONTRACT_ID` |
| Signed by the user | inner tx must carry a signature; the sponsor can't be the source | — |
| Max fee per transaction | 1,000,000 stroops (0.1 XLM) | `FEE_SPONSOR_MAX_FEE_STROOPS` |
| Per-account rate limit | 20 sponsored transactions per hour | `FEE_SPONSOR_MAX_TX_PER_HOUR` |
| Global daily budget | 500,000,000 stroops (50 XLM) per UTC day | `FEE_SPONSOR_DAILY_BUDGET_STROOPS` |

Declined requests get a `4xx`/`503` and the frontend falls back to user-paid
fees, so limits never block a user who holds XLM.

The rate limit and budget are kept in memory in the prototype. Serverless
instances don't share memory, so before mainnet they must move to a shared store
(Vercel KV / Redis), and the sponsor account balance should be monitored
alongside the escrow alerts.

Other notes:

- Keep the sponsor account funded with only a few days of budget, so a
  leaked key or a bug has bounded impact. Top it up from a cold wallet.
- Failed transactions still consume the fee. A per-account limit on failed
  sponsored transactions is the next limit to add if this shows up in practice.

## Running the prototype on testnet

1. Create and fund a sponsor account:
   ```bash
   stellar keys generate fee-sponsor --network testnet --fund
   stellar keys show fee-sponsor   # secret key for FEE_SPONSOR_SECRET
   ```
2. In the Vercel project (server-side env, no `VITE_` prefix) set
   `FEE_SPONSOR_ENABLED=true` and `FEE_SPONSOR_SECRET`, plus the limits if you
   want non-default values. `CONTRACT_ID`, `RPC_URL` and `NETWORK_PASSPHRASE`
   fall back to the existing `VITE_*` values.
3. Set `VITE_FEE_SPONSOR_URL=/api/fee-bump` for the frontend build.
4. Perform any marketplace action (post a job, place a bid). The transaction's
   fee account in the explorer is the sponsor, and the user's XLM balance is
   unchanged.
