# Contract Monitoring & Alerts

Once the marketplace is live, two scheduled jobs give visibility into the
contract and post alerts to a chat channel.

| Job | Schedule | Script | Purpose |
| --- | --- | --- | --- |
| Contract Monitoring (`.github/workflows/contract-monitoring.yml`) | hourly | `scripts/monitor-contract.sh` | Event indexing, alerts, escrow dashboard |
| Escrow Reconciliation (`.github/workflows/escrow-reconciliation.yml`) | daily 06:00 UTC | `scripts/reconcile-escrow.sh` | Full escrow vs. balance reconciliation report |

Both can also be started manually from the Actions tab or run locally:

```bash
CONTRACT_ID=C... SOURCE_ACCOUNT=deployer ./scripts/monitor-contract.sh testnet
```

## Alerts

Alerts are posted to `ALERT_WEBHOOK_URL`, a Slack or Discord incoming webhook
for the ops channel. Any alert also fails the workflow run, so GitHub
notifications act as a backup channel.

| Alert | Trigger | Default |
| --- | --- | --- |
| Contract paused | `is_paused` returns `true` | — |
| Pause state changed | a `pause` event in the window while unpaused (pause + unpause) | — |
| Dispute spike | `dispute` events in the window ≥ `DISPUTE_SPIKE_THRESHOLD` | 5 per hour |
| Large escrow | an open escrow ≥ `LARGE_ESCROW_STROOPS` | 1,000 USDC |
| Escrow/balance mismatch | contract USDC balance ≠ sum of open escrows | any difference |

The window is `WINDOW_LEDGERS` ledgers (default 720, about one hour at ~5s per
ledger), matching the hourly schedule. Conditions that persist (paused, large
escrow, mismatch) alert on every run until resolved.

## Event indexing

Each run queries Soroban RPC `getEvents` for the contract's events in the window
and counts them by topic: `job_post`, `bid_accept`, `approved`, `dispute`,
`dispute_res`, `refund`, `reclaim`, `claimable` and `pause`. The counts appear
in the dashboard. RPC providers keep events for a limited retention period, so
the window must stay within it.

## Dashboard

Each monitoring run writes `reports/escrow-dashboard-<network>.md` with:

- open escrow count and USDC locked (funded vs. disputed)
- contract USDC balance and drift
- `total_locked_escrow` against the `max_total_escrow` cap
- platform stats (jobs, volume, disputes)
- event counts for the window and the list of large escrows

The dashboard is published to the workflow run's job summary and uploaded as
an artifact.

## Configuration

| Name | Kind | Purpose |
| --- | --- | --- |
| `MARKETPLACE_CONTRACT_ID` | secret | Contract to monitor |
| `RECONCILE_SECRET_KEY` | secret | Funded account used only to simulate read-only calls |
| `ALERT_WEBHOOK_URL` | secret | Slack/Discord webhook for the alert channel |
| `MONITOR_NETWORK` | variable | Network for scheduled runs (default `testnet`) |
| `DISPUTE_SPIKE_THRESHOLD` | variable | Disputes per window that trigger an alert |
| `LARGE_ESCROW_STROOPS` | variable | Escrow size (stroops, 7 decimals) that triggers an alert |

## Responding to alerts

- **Contract paused / pause state changed** – confirm with the admin multisig
  holders that the pause was intentional. If nobody initiated it, treat the
  admin key as compromised and start the incident process.
- **Dispute spike** – review the new disputes for a common agent, client or
  job pattern (fraud or a broken agent) and consider denylisting the address
  (`add_to_denylist`).
- **Large escrow** – check the client and agent against the denylist and
  confirm the job is legitimate. The `max_job_budget` and `max_total_escrow`
  caps bound the exposure.
- **Escrow/balance mismatch** – follow the drift runbook in
  [escrow-reconciliation.md](escrow-reconciliation.md).
