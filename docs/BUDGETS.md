# Resource Budgets & Mainnet Fees

Soroban meters every transaction against network-wide resource limits. An
entrypoint that is close to a limit in local tests can fail on mainnet once
storage grows, so each entrypoint's budget is recorded and checked in CI.

## Limits and the 70% rule

No entrypoint may use more than **70%** of a mainnet per-transaction limit.

| Resource | Mainnet tx limit | 70% ceiling |
|----------|------------------|-------------|
| CPU instructions | 100,000,000 | 70,000,000 |
| Memory | 41,943,040 bytes (40 MiB) | 29,360,128 bytes |

The CPU and memory ceilings are enforced by
`contracts/ai-agent-marketplace/src/budget_test.rs`, which runs as part of
`cargo test` and as a dedicated step in the `Contract Check` CI job. A change
that pushes any entrypoint above 70% fails the build.

## Per-entrypoint budget table

The test invokes each entrypoint once on a realistic path (happy path, dispute
path, cancellation, keeper, admin and paginated reads) and prints a Markdown
row per entrypoint:

```bash
cd contracts/ai-agent-marketplace
cargo test budget -- --nocapture
```

Paste the printed table below when entrypoints change.

| Entrypoint | CPU instructions | % of limit | Memory bytes | % of limit |
|---|---|---|---|---|
| initialize | | | | |
| register_agent | | | | |
| post_job | | | | |
| place_bid | | | | |
| accept_bid | | | | |
| submit_deliverable | | | | |
| approve_deliverable | | | | |
| leave_review | | | | |
| raise_dispute | | | | |
| resolve_dispute | | | | |
| bump_ttl | | | | |
| cancel_job | | | | |
| pause | | | | |
| unpause | | | | |
| add_to_denylist | | | | |
| get_all_jobs (50) | | | | |
| get_all_agents (50) | | | | |

The unit-test budget meters the contract as native code, so it is a
lower bound. Confirm the numbers on testnet with simulation before mainnet:

```bash
stellar contract invoke --id "$(cat .contract-id-testnet)" --network testnet \
  --source-account deployer --sim-only -- <entrypoint> <args>
```

The simulation result reports instructions, read/write bytes, ledger entries
read/written and `minResourceFee` for the call.

## Read/write budgets

All marketplace state is kept in **instance storage**, so every entrypoint
reads (and most write) the whole contract instance entry. Read and write bytes
therefore grow with the number of agents, jobs, bids and reviews, not just with
the work done by the call. Re-run the testnet simulation for `accept_bid`,
`approve_deliverable` and `resolve_dispute` (the largest writers) after any
significant growth in on-chain state, and keep them under 70% of the network's
read/write byte limits shown by `stellar network settings` / Soroban RPC
`getNetwork` config.

## Estimating fees in USD

For each entrypoint:

```
fee_xlm = (inclusion_fee + minResourceFee) / 10_000_000
fee_usd = fee_xlm × XLM/USD price
```

- `inclusion_fee` is the base fee you bid (default 100 stroops; raise it during
  surge pricing).
- `minResourceFee` comes from the testnet simulation above and reflects the
  current network fee schedule for CPU, read/write bytes, ledger entries,
  events and rent.
- Use the XLM/USD price at the time of publishing and record it next to the
  table so readers can rescale.
