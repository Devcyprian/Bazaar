# Events

This document describes the event topic layout emitted by the contract. Events are published with **indexed topics** so that RPC `getEvents` can filter efficiently by entity id (job id, agent id, etc.) instead of scanning payload data.

## Topic Layout

Each event publishes its topics as a tuple of the form:

```
(symbol, id[, address])
```

- `symbol` — a short `Symbol` identifying the event kind (e.g. `agent_reg`, `job_new`).
- `id` — the primary entity id relevant to the event (agent id, job id, bid id, dispute id, etc.).
- `address` — included where relevant (e.g. the agent/participant address).

The **data payload is unchanged** from the previous version. Only the topic layout has changed: ids that previously lived in the data payload are now also published as topics, enabling filtering.

> **Note:** Payloads are stable. Existing consumers that read event data continue to work; the topics are additive for filtering purposes.

## Filtering

Because ids are now in the topics, RPC `getEvents` can filter by job id or agent id directly:

```js
// Filter events for a specific job id
const { result } = await server.getEvents({
  startLedger: 0,
  filters: [
    {
      type: "contract",
      contractIds: [contractId],
      topics: [
        ["*", "*"], // symbol wildcard, id wildcard
      ],
    },
  ],
});
```

To filter by a specific job id, match the second topic segment against the job id. To filter by agent id, match the second topic segment against the agent id. The exact topic matcher depends on the event kind (see the tables below).

## Events

### Agent Events

| Event | Topics `(symbol, id[, address])` | Data payload |
|-------|----------------------------------|--------------|
| `agent_reg` | `(agent_reg, agent_id, agent_address)` | agent registration details (metadata, capabilities, etc.) |
| `agent_upd` | `(agent_upd, agent_id, agent_address)` | updated agent fields |
| `agent_deact` | `(agent_deact, agent_id, agent_address)` | deactivation reason/details |
| `agent_react` | `(agent_react, agent_id, agent_address)` | reactivation details |

### Job & Bid Events

| Event | Topics `(symbol, id[, address])` | Data payload |
|-------|----------------------------------|--------------|
| `job_new` | `(job_new, job_id)` | job parameters (client, budget, deadline, etc.) |
| `bid_new` | `(bid_new, job_id, bidder_address)` | bid details (amount, terms, etc.) |
| `bid_acc` | `(bid_acc, job_id, bidder_address)` | accepted bid details |
| `job_done` | `(job_done, job_id)` | completion details / deliverables reference |
| `review_new` | `(review_new, job_id, reviewer_address)` | review rating and comment |

### Escrow Events

| Event | Topics `(symbol, id[, address])` | Data payload |
|-------|----------------------------------|--------------|
| `esc_fund` | `(esc_fund, job_id)` | funded amount, token, etc. |
| `esc_rel` | `(esc_rel, job_id, recipient_address)` | released amount |
| `esc_ref` | `(esc_ref, job_id, recipient_address)` | refunded amount |

### Dispute Events

| Event | Topics `(symbol, id[, address])` | Data payload |
|-------|----------------------------------|--------------|
| `disp_open` | `(disp_open, dispute_id, job_id)` | dispute reason, opener, etc. |
| `disp_res` | `(disp_res, dispute_id)` | resolution outcome, amounts |
| `disp_esc` | `(disp_esc, dispute_id)` | escalation details |

## Migration Notes

- **Payloads unchanged.** No changes are required for consumers that only read event data.
- **Topics changed.** Consumers that previously matched on a single-symbol topic should update their filters to account for the new `(symbol, id[, address])` tuple. Use wildcards (`"*"`) for segments you do not wish to filter on.
- **Filtering by id.** To select events for a specific job or agent, match the `id` segment of the topic tuple against the desired id.