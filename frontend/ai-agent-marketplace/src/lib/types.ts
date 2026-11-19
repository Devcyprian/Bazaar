/**
 * Shared contract data types.
 *
 * These mirror the on-chain Soroban structs (see
 * `contracts/ai-agent-marketplace/src/lib.rs`) but use the camelCase naming
 * convention the UI expects. The conversion from snake_case ScVal maps happens
 * in `marketplaceClient.ts`.
 *
 * Notable divergence from older versions of this file:
 * - `Job.bids` has been removed. The on-chain Job struct never populated the
 *   inline bids Vec (bids live under DataKey::BidsByJob). Use
 *   `MarketplaceClient.getBidsByJob()` to fetch real bid data.
 */

export type JobStatus =
  | 'Open'
  | 'InProgress'
  | 'Completed'
  | 'Disputed'
  | 'Cancelled'
  | 'Refunded';

export type BidStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Withdrawn';

/**
 * Offset/limit parameters for paginated contract queries.
 *
 * Mirrors the on-chain signatures, e.g.
 * `get_jobs_by_client(env, client, offset, limit)`.
 */
export interface PageParams {
  offset: number;
  limit: number;
}

/**
 * A single page of results returned by a paginated contract query.
 *
 * `items` is the slice returned by the contract (empty when `offset` is out of
 * bounds). `offset`/`limit` echo the request so infinite-scroll hooks can
 * compute the next page, and `hasMore` indicates whether another page may
 * exist (i.e. the returned page was full).
 */
export interface PaginatedResult<T> {
  items: T[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

export type EscrowStatus = 'Funded' | 'Released' | 'Disputed' | 'Refunded';

/**
 * Outcome of a dispute, mirroring the on-chain `DisputeResolution` enum.
 *
 * - `Agent`  — the full escrow is released to the agent.
 * - `Client` — the full escrow is refunded to the client.
 * - `Split`  — the escrow is split; `percentage` is the agent's share
 *   (0–100), the remainder goes to the client.
 *
 * Modelled as a discriminated union so an invalid resolution is impossible at
 * the type level.
 */
export type DisputeResolution =
  | { kind: 'Agent' }
  | { kind: 'Client' }
  | { kind: 'Split'; percentage: number };

/**
 * A dispute raised against a job's escrow, mirroring the on-chain `Dispute`
 * struct. `resolution` is `null` until an admin resolves the dispute.
 */
export interface Dispute {
  jobId: number;
  raisedBy: string;
  reason: string;
  /** Unix timestamp (seconds) the dispute was raised. */
  raisedAt: number;
  /** Resolution outcome, or `null` while the dispute is still open. */
  resolution: DisputeResolution | null;
  /** Unix timestamp (seconds) the dispute was resolved, or `null`. */
  resolvedAt: number | null;
}

export interface Agent {
  id: number;
  owner: string;
  name: string;
  description: string;
  skills: string[];
  pricePerTask: number;
  reputation: number;
  totalJobsCompleted: number;
  totalEarnings: number;
  isActive: boolean;
  createdAt: number;
  skillsVerified: Record<string, boolean>;
  metadataUri: string;
}

export interface Bid {
  id: number;
  agent: string;
  agentId: number;
  amount: number;
  /** Unix timestamp (seconds) the agent proposed to deliver by. */
  proposedTimeline: number;
  proposal: string;
  submittedAt: number;
  status: BidStatus;
}

export interface Job {
  id: number;
  client: string;
  title: string;
  description: string;
  requiredSkills: string[];
  budget: number;
  deadline: number;
  status: JobStatus;
  assignedAgent: string | null;
  // Bids are stored separately on-chain under the BidsByJob index.
  // Use client.getBidsByJob(jobId, offset, limit) to fetch them.
  escrowAmount: number;
  /**
   * Unix timestamp (seconds) the escrow was created. Not part of the contract
   * `Job` struct; populated from the linked `Escrow` (see `getEscrowByJob`)
   * when available, otherwise `null`.
   */
  escrowCreatedAt: number | null;
  /**
   * Current status of the linked escrow, populated from `getEscrowByJob` when
   * available, otherwise `null`. Used by the JobDetail reclaim UI to decide
   * whether the escrow is still `Funded` and therefore reclaimable.
   */
  escrowStatus: EscrowStatus | null;
  createdAt: number;
  /**
   * Unix timestamp (seconds) the bid was accepted and the job moved to
   * `InProgress`. Used as the start of the dispute window for jobs that never
   * completed. `null` while the job is still `Open`.
   */
  acceptedAt: number | null;
  completedAt: number | null;
  deliverableHash: string | null;
  disputeRaised: boolean;
}

export interface Review {
  id: number;
  jobId: number;
  reviewer: string;
  reviewee: string;
  /** Integer rating from 1 to 5. */
  rating: number;
  comment: string;
  createdAt: number;
}

/**
 * Off-chain agent metadata stored at `Agent.metadataUri` (IPFS or HTTPS).
 *
 * The shape is defined by the zod schema in `lib/agentMetadata.ts`; this type
 * is inferred from that schema so validation and typing stay in sync. All
 * fields are optional so partially-filled profiles still validate.
 */
export type AgentMetadata = {
  /** Display name for the agent profile. */
  name?: string;
  /** Short bio / description. */
  description?: string;
  /** Avatar image URL (`ipfs://` or `https://`). */
  avatar?: string;
  /** External links (website, socials, docs). */
  links?: Array<{
    label: string;
    url: string;
  }>;
  /** Portfolio entries showcasing past work. */
  portfolio?: Array<{
    title: string;
    description?: string;
    url?: string;
    image?: string;
  }>;
};

export interface PlatformStats {
  totalAgents: number;
  totalJobs: number;
  totalVolume: number;
  totalFeesCollected: number;
  totalDisputes: number;
  avgJobCompletionTime: number;
  /** Number of jobs currently in the `Open` status (on-chain `open_jobs`). */
  openJobs: number;
  /** Number of agents currently active (on-chain `active_agents`). */
  activeAgents: number;
}

export interface Escrow {
  jobId: number;
  client: string;
  agent: string;
  amount: number;
  token: string;
  status: EscrowStatus;
  createdAt: number;
  releasedAt: number | null;
  disputeRaisedAt: number | null;
  resolver: string | null;
}

/**
 * A single payment/escrow movement for an account, used by the Dashboard CSV
 * export. `amount` and `fee` are raw token base units (apply the token's
 * decimals when formatting for display/export).
 */
export interface PaymentRecord {
  jobId: number;
  amount: number;
  fee: number;
  txHash: string;
  /** Unix timestamp (seconds) the payment was recorded. */
  createdAt: number;
  status: EscrowStatus;
}

/**
 * A denylisted address. Managed by the admin multisig on-chain (or via the
 * frontend blocklist config) so entries can be added/removed without a
 * redeploy.
 */
export interface DenylistEntry {
  address: string;
  /** Human-readable reason for the block (e.g. sanctions match). */
  reason: string;
  /** Unix timestamp (seconds) the entry was added. */
  addedAt: number;
}

/**
 * Frontend compliance configuration: the set of blocked addresses and
 * restricted regions used to gate posting and bidding.
 */
export interface ComplianceConfig {
  /** Addresses that may not post jobs or place bids. */
  blockedAddresses: string[];
  /** ISO 3166-1 alpha-2 region codes that are restricted. */
  restrictedRegions: string[];
  /** Full denylist entries with metadata, when available. */
  denylist: DenylistEntry[];
  /** Whether the compliance check is enforced. */
  enabled: boolean;
}
