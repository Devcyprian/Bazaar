import type { Page } from '@playwright/test';
import type { Agent, Job, PlatformStats } from '../src/lib/types';

/**
 * Deterministic Soroban contract fixtures used by the Playwright e2e suite.
 *
 * The marketplace reads all of its data through `useStellar().getContractClient()`
 * (a `MarketplaceClient`). In CI there is no live Soroban RPC or deployed
 * contract, so the e2e harness injects a fixture-backed client via a small test
 * seam in `src/contexts/StellarContext.tsx` (it returns
 * `window.__E2E_MARKETPLACE_CLIENT__` when present). The fixtures below mirror
 * the decoded `Agent` / `Job` / `PlatformStats` shapes from `src/lib/types.ts`
 * so the UI renders exactly as it would against a real contract.
 *
 * Skill selection is intentionally crafted so the search tests are
 * unambiguous: "CodeForge" matches a single agent name, and "stellar" is a
 * skill unique to the third agent.
 */

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export const agents: Agent[] = [
  {
    id: 1,
    owner: 'GA2CZ5K7PE4M9XQ1RT8VW3S6Y7Z8A9B0C1D2E3F4G5H6I7J8K9L0M1',
    name: 'CodeForge AI',
    description: 'Builds smart contracts and ML pipelines in Rust and Python.',
    skills: ['python', 'rust', 'machine-learning', 'smart-contracts'],
    pricePerTask: 50000000,
    reputation: 4.8,
    totalJobsCompleted: 24,
    totalEarnings: 1200000000,
    isActive: true,
    createdAt: 1700000000,
    skillsVerified: { python: true, rust: true, 'machine-learning': false },
    metadataUri: 'ipfs://codeforge',
  },
  {
    id: 2,
    owner: 'GB3DA6L8QF5N0YR2SU9WX4T7Z8A9B0C1D2E3F4G5H6I7J8K9L0M1N2',
    name: 'DataMiner Bot',
    description: 'Data engineering, ETL, and quantitative analysis at scale.',
    skills: ['python', 'data-science', 'trading'],
    pricePerTask: 30000000,
    reputation: 4.2,
    totalJobsCompleted: 15,
    totalEarnings: 450000000,
    isActive: true,
    createdAt: 1701000000,
    skillsVerified: { python: true },
    metadataUri: 'ipfs://dataminer',
  },
  {
    id: 3,
    owner: 'GC4EB7M9RG6O0ZS3TV1XY5U8A9B0C1D2E3F4G5H6I7J8K9L0M1N2O3',
    name: 'ChainSentinel',
    description:
      'Smart contract auditing and security reviews for Soroban and Solidity.',
    skills: ['rust', 'smart-contracts', 'soroban', 'stellar'],
    pricePerTask: 75000000,
    reputation: 4.9,
    totalJobsCompleted: 31,
    totalEarnings: 2325000000,
    isActive: true,
    createdAt: 1702000000,
    skillsVerified: { rust: true, soroban: true },
    metadataUri: 'ipfs://chainsentinel',
  },
];

export const jobs: Job[] = [
  {
    id: 1,
    client: 'GA2CZ5K7PE4M9XQ1RT8VW3S6Y7Z8A9B0C1D2E3F4G5H6I7J8K9L0M1',
    title: 'Build a fraud detection ML model',
    description: 'Need an ML expert to build a fraud detection pipeline in Python.',
    requiredSkills: ['python', 'machine-learning'],
    budget: 500000000,
    deadline: nowSeconds() + 30 * 86400,
    status: 'Open',
    assignedAgent: null,
    escrowAmount: 0,
    escrowCreatedAt: null,
    createdAt: 1700000000,
    completedAt: null,
    deliverableHash: null,
    disputeRaised: false,
  },
  {
    id: 2,
    client: 'GC4EB7M9RG6O0ZS3TV1XY5U8A9B0C1D2E3F4G5H6I7J8K9L0M1N2O3',
    title: 'Audit a Soroban DeFi vault',
    description: 'Security review of a Soroban lending vault written in Rust.',
    requiredSkills: ['rust', 'soroban'],
    budget: 800000000,
    deadline: nowSeconds() + 21 * 86400,
    status: 'Open',
    assignedAgent: null,
    escrowAmount: 0,
    escrowCreatedAt: null,
    createdAt: 1700500000,
    completedAt: null,
    deliverableHash: null,
    disputeRaised: false,
  },
];

export const stats: PlatformStats = {
  totalAgents: agents.length,
  totalJobs: jobs.length,
  totalVolume: 3975000000,
  totalFeesCollected: 39750000,
  totalDisputes: 0,
  avgJobCompletionTime: 5 * 86400,
};

/**
 * Returns a self-contained JS snippet that installs a fixture-backed
 * marketplace client on `window.__E2E_MARKETPLACE_CLIENT__`. The snippet is
 * evaluated by Playwright (via `page.addInitScript`) BEFORE the app mounts, so
 * it only references its own in-page scope — no Node imports cross the page
 * boundary.
 */
export function mockClientInitScript(): string {
  const data = JSON.stringify({ agents, jobs, stats });
  return `(function () {
  var data = ${data};
  var findById = function (arr, id) {
    return arr.find(function (x) { return x.id === id; }) || null;
  };
  window.__E2E_MARKETPLACE_CLIENT__ = {
    getAllAgents: function () { return Promise.resolve(data.agents); },
    getAllJobs: function () { return Promise.resolve(data.jobs); },
    getPlatformStats: function () { return Promise.resolve(data.stats); },
    getAgentsBySkill: function (skill) {
      return Promise.resolve(
        data.agents
          .filter(function (a) { return a.skills.indexOf(skill) !== -1; })
          .map(function (a) { return a.id; })
      );
    },
    getAgent: function (id) { return Promise.resolve(findById(data.agents, id)); },
    getJob: function (id) { return Promise.resolve(findById(data.jobs, id)); },
    getAgentByOwner: function () { return Promise.resolve(null); },
    getJobsByClient: function () { return Promise.resolve([]); },
    getJobsByAgent: function () { return Promise.resolve([]); },
    getBidsByJob: function () { return Promise.resolve([]); },
    getBidsByAgent: function () { return Promise.resolve([]); },
    getReviewsByReviewee: function () { return Promise.resolve([]); },
    getBid: function () { return Promise.resolve(null); },
    getReview: function () { return Promise.resolve(null); },
    getEscrowByJob: function () { return Promise.resolve(null); }
  };
})();`;
}

/**
 * Installs the fixture-backed marketplace client for every navigation of
 * `page`. Must be called before navigating so the client is in place before
 * the React app mounts.
 */
export async function enableMockContract(page: Page): Promise<void> {
  await page.addInitScript(mockClientInitScript());
}

/** Public key reported by the mocked Freighter wallet when connected. */
export const MOCK_WALLET_PUBLIC_KEY =
  'GA2CZ5K7PE4M9XQ1RT8VW3S6Y7Z8A9B0C1D2E3F4G5H6I7J8K9L0M1';

/** Network passphrase reported by the mocked Freighter wallet. */
export const MOCK_NETWORK_PASSPHRASE =
  'Test SDF Network ; September 2015';

/**
 * Returns a self-contained JS snippet that installs a mocked Freighter wallet
 * on `window.freighter` (and `window.freighterApi`). The snippet is evaluated
 * by Playwright (via `page.addInitScript`) BEFORE the app mounts, so the
 * wallet-gating logic sees a deterministic wallet regardless of whether a real
 * extension is installed in CI.
 *
 * When `connected` is false, `isConnected`/`isAllowed` resolve to false and
 * `getPublicKey` rejects, which is what the app treats as "wallet not
 * connected" and uses to gate CreateJob / RegisterAgent.
 */
export function mockFreighterInitScript(connected: boolean): string {
  const publicKey = JSON.stringify(MOCK_WALLET_PUBLIC_KEY);
  const networkPassphrase = JSON.stringify(MOCK_NETWORK_PASSPHRASE);
  return `(function () {
  var connected = ${connected ? 'true' : 'false'};
  var publicKey = ${publicKey};
  var networkPassphrase = ${networkPassphrase};
  var notConnectedError = new Error('Freighter is not connected');
  var freighter = {
    isConnected: function () { return Promise.resolve(connected); },
    isAllowed: function () { return Promise.resolve(connected); },
    getPublicKey: function () {
      return connected ? Promise.resolve(publicKey) : Promise.reject(notConnectedError);
    },
    getNetwork: function () {
      return Promise.resolve({ network: 'TESTNET', networkPassphrase: networkPassphrase });
    },
    getNetworkDetails: function () {
      return Promise.resolve({
        network: 'TESTNET',
        networkUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase: networkPassphrase,
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org'
      });
    },
    signTransaction: function (xdr) {
      return connected
        ? Promise.resolve({ signedTxXdr: xdr, signerAddress: publicKey })
        : Promise.reject(notConnectedError);
    },
    signAuthEntry: function (entry) {
      return connected
        ? Promise.resolve({ signedAuthEntry: entry, signerAddress: publicKey })
        : Promise.reject(notConnectedError);
    },
    signMessage: function (message) {
      return connected
        ? Promise.resolve({ signedMessage: message, signerAddress: publicKey })
        : Promise.reject(notConnectedError);
    },
    requestAccess: function () {
      return connected ? Promise.resolve(publicKey) : Promise.reject(notConnectedError);
    }
  };
  window.freighter = freighter;
  window.freighterApi = freighter;
})();`;
}

/**
 * Installs a mocked Freighter wallet that reports a connected account for
 * every navigation of `page`. Must be called before navigating.
 */
export async function mockFreighterConnected(page: Page): Promise<void> {
  await page.addInitScript(mockFreighterInitScript(true));
}

/**
 * Installs a mocked Freighter wallet that reports no connected account for
 * every navigation of `page`. Must be called before navigating.
 */
export async function mockFreighterDisconnected(page: Page): Promise<void> {
  await page.addInitScript(mockFreighterInitScript(false));
}

/**
 * Returns a self-contained JS snippet that stubs the Soroban RPC transport so
 * contract simulations resolve deterministically without network access.
 *
 * `rpc` is a JSON-serialisable map of method name -> result value. Supported
 * keys mirror the Soroban RPC methods the app may call:
 *   - `getLatestLedger`  -> ledger sequence object
 *   - `getLedgerEntries` -> `{ entries: [] }`
 *   - `getAccount`       -> account object
 *   - `simulateTransaction` -> `{ results: [], latestLedger }`
 *   - `sendTransaction`  -> `{ status: 'PENDING', hash }`
 *   - `getTransaction`   -> `{ status: 'SUCCESS' }`
 * Any method not present in the map resolves to a benign default.
 */
export function mockRpcInitScript(
  rpc: Record<string, unknown> = {},
): string {
  const overrides = JSON.stringify(rpc);
  return `(function () {
  var overrides = ${overrides};
  var defaults = {
    getLatestLedger: { sequence: 1000, id: 'mock-ledger', protocolVersion: 21 },
    getLedgerEntries: { entries: [], latestLedger: 1000 },
    getAccount: { id: 'mock-account', sequence: '1' },
    simulateTransaction: { results: [], latestLedger: 1000 },
    sendTransaction: { status: 'PENDING', hash: 'mock-tx-hash' },
    getTransaction: { status: 'SUCCESS', latestLedger: 1000 }
  };
  var resolveResult = function (method) {
    if (Object.prototype.hasOwnProperty.call(overrides, method)) {
      return overrides[method];
    }
    if (Object.prototype.hasOwnProperty.call(defaults, method)) {
      return defaults[method];
    }
    return null;
  };
  var rpcServer = {
    getLatestLedger: function () { return Promise.resolve(resolveResult('getLatestLedger')); },
    getLedgerEntries: function () { return Promise.resolve(resolveResult('getLedgerEntries')); },
    getAccount: function () { return Promise.resolve(resolveResult('getAccount')); },
    simulateTransaction: function () { return Promise.resolve(resolveResult('simulateTransaction')); },
    sendTransaction: function () { return Promise.resolve(resolveResult('sendTransaction')); },
    getTransaction: function () { return Promise.resolve(resolveResult('getTransaction')); }
  };
  window.__E2E_SOROBAN_RPC__ = rpcServer;
  window.__E2E_SOROBAN_RPC_RESULT__ = resolveResult;
})();`;
}

/**
 * Installs a mocked Soroban RPC transport for every navigation of `page`.
 * Must be called before navigating. Pass a map of method name -> result to
 * override the deterministic defaults.
 */
export async function mockRpc(
  page: Page,
  rpc: Record<string, unknown> = {},
): Promise<void> {
  await page.addInitScript(mockRpcInitScript(rpc));
}
