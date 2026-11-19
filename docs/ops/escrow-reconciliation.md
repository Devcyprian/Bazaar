# Escrow Reconciliation

A daily job compares the escrow ledger recorded in contract state with the
contract's actual USDC balance, so accounting bugs surface before a user
reports them.

## What it checks

`scripts/reconcile-escrow.sh` runs three read-only queries against the contract:

1. **Open escrows** – walks `get_all_jobs` and calls `get_escrow_by_job` for every
   job with a non-zero `escrow_amount`. Escrows in `Funded` or `Disputed` status
   still hold funds and are summed.
2. **USDC balance** – calls `balance` on the configured `usdc_token` for the
   contract address.
3. **`total_locked_escrow`** – the running counter in `get_config`.

It reports two numbers:

| Drift | Formula | Expected |
| --- | --- | --- |
| Balance drift | USDC balance − open escrows | `0` |
| Counter drift | `total_locked_escrow` − open escrows | `0` |

Any non-zero drift posts an alert to `ALERT_WEBHOOK_URL` and the script exits
with code `2`, which fails the workflow run.

## Schedule and configuration

`.github/workflows/escrow-reconciliation.yml` runs daily at 06:00 UTC and can be
started manually from the Actions tab. Configure:

| Name | Kind | Purpose |
| --- | --- | --- |
| `MARKETPLACE_CONTRACT_ID` | secret | Contract to reconcile |
| `RECONCILE_SECRET_KEY` | secret | Funded account used only to simulate read-only calls (no transactions are sent) |
| `ALERT_WEBHOOK_URL` | secret | Slack or Discord incoming webhook for alerts |
| `RECONCILE_NETWORK` | variable | Network for scheduled runs (default `testnet`) |

Each run uploads the Markdown report as an artifact (kept 90 days) and adds it
to the job summary.

Run it locally with:

```bash
CONTRACT_ID=C... SOURCE_ACCOUNT=deployer ./scripts/reconcile-escrow.sh testnet
```

## Responding to a drift alert

1. **Acknowledge** the alert in the channel and open an incident.
2. **Re-run** the workflow to rule out an RPC glitch or a transaction that landed
   between queries. If the second run is balanced, close the incident.
3. **Classify** the drift using the report:
   - **Positive balance drift, counter drift `0`** – the contract holds more USDC
     than open escrows. Usual causes are a direct USDC transfer to the contract
     or payouts recorded as claimable balances (`claimable` events) that have
     not been claimed yet. Match the amount against recent `claimable` events
     and token transfers.
   - **Negative balance drift** – the contract holds less USDC than it owes.
     Treat as critical: **pause the contract** (`set_paused` with the admin
     multisig) to stop new escrows and payouts while investigating.
   - **Non-zero counter drift** – `total_locked_escrow` diverged from escrow
     state, which affects the `max_total_escrow` cap. Identify the escrow
     transition (accept, approve, dispute resolution, reclaim) that did not
     update the counter.
4. **Investigate** with the per-escrow table in the report and the contract
   events for the affected jobs (`bid_accept`, `approved`, `dispute_res`,
   `refund`, `reclaim`, `claim`).
5. **Resolve** – fix the root cause, then unpause once a reconciliation run is
   balanced (or the remaining drift is fully explained and documented in the
   incident).
6. **Post-mortem** – record the cause, the affected jobs and the fix in the
   incident notes.
