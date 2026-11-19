/**
 * Fee-sponsorship prototype (#186) — Vercel serverless function.
 *
 * Accepts a user-signed marketplace transaction, wraps it in a fee-bump
 * transaction paid by the platform sponsor account, and submits it. The user
 * never pays network fees, so they do not need to hold XLM for fees.
 *
 * POST /api/fee-bump  { "xdr": "<signed inner transaction XDR>" }
 *   200 { "hash": "<fee-bump transaction hash>" }
 *   4xx { "error": "<reason>" }  — caller should fall back to paying its own fee
 *
 * Server-side environment (never exposed to the browser):
 *   FEE_SPONSOR_SECRET              Secret key of the sponsor account (required)
 *   FEE_SPONSOR_ENABLED             "true" to enable (kill switch, default off)
 *   CONTRACT_ID / VITE_CONTRACT_ID  Only calls to this contract are sponsored
 *   RPC_URL / VITE_RPC_URL          Soroban RPC endpoint
 *   NETWORK_PASSPHRASE / VITE_NETWORK_PASSPHRASE
 *   FEE_SPONSOR_MAX_FEE_STROOPS     Max fee sponsored per transaction (default 1_000_000 = 0.1 XLM)
 *   FEE_SPONSOR_MAX_TX_PER_HOUR     Max sponsored transactions per account per hour (default 20)
 *   FEE_SPONSOR_DAILY_BUDGET_STROOPS Max total fees sponsored per UTC day (default 500_000_000 = 50 XLM)
 *
 * Design, cost model and abuse limits: docs/ops/fee-sponsorship.md
 */

import {
  Address,
  FeeBumpTransaction,
  Keypair,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

const env = (name: string, fallback?: string): string | undefined =>
  process.env[name] ?? (fallback ? process.env[fallback] : undefined);

const MAX_FEE_STROOPS = BigInt(env('FEE_SPONSOR_MAX_FEE_STROOPS') ?? '1000000');
const MAX_TX_PER_HOUR = Number(env('FEE_SPONSOR_MAX_TX_PER_HOUR') ?? '20');
const DAILY_BUDGET_STROOPS = BigInt(env('FEE_SPONSOR_DAILY_BUDGET_STROOPS') ?? '500000000');
/** Inclusion fee per operation for the fee-bump envelope (stroops). */
const FEE_BUMP_BASE_FEE = '200';

// In-memory limits. Adequate for a single-instance testnet prototype; a
// production deployment must move these to a shared store (e.g. Vercel KV /
// Redis) because serverless instances do not share memory.
const recentBySource = new Map<string, number[]>();
let budgetDay = '';
let budgetSpent = 0n;

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function isRateLimited(source: string, now: number): boolean {
  const hourAgo = now - 60 * 60 * 1000;
  const recent = (recentBySource.get(source) ?? []).filter((t) => t > hourAgo);
  recentBySource.set(source, recent);
  return recent.length >= MAX_TX_PER_HOUR;
}

function recordSponsored(source: string, now: number, fee: bigint): void {
  recentBySource.get(source)?.push(now);
  budgetSpent += fee;
}

function remainingBudget(now: number): bigint {
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== budgetDay) {
    budgetDay = day;
    budgetSpent = 0n;
  }
  return DAILY_BUDGET_STROOPS - budgetSpent;
}

/** Returns the contract address targeted by a single invokeContract operation, or null. */
function invokedContract(tx: Transaction): string | null {
  if (tx.operations.length !== 1) return null;
  const op = tx.operations[0];
  if (op.type !== 'invokeHostFunction') return null;
  const fn = op.func;
  if (fn.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) return null;
  return Address.fromScAddress(fn.invokeContract().contractAddress()).toString();
}

export async function POST(request: Request): Promise<Response> {
  if (env('FEE_SPONSOR_ENABLED') !== 'true') {
    return json(503, { error: 'Fee sponsorship is disabled' });
  }

  const secret = env('FEE_SPONSOR_SECRET');
  const contractId = env('CONTRACT_ID', 'VITE_CONTRACT_ID');
  const rpcUrl = env('RPC_URL', 'VITE_RPC_URL');
  const passphrase = env('NETWORK_PASSPHRASE', 'VITE_NETWORK_PASSPHRASE');
  if (!secret || !contractId || !rpcUrl || !passphrase) {
    return json(503, { error: 'Fee sponsorship is not configured' });
  }

  let body: { xdr?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (typeof body.xdr !== 'string' || body.xdr.length === 0) {
    return json(400, { error: 'xdr is required' });
  }

  let inner: Transaction;
  try {
    const parsed = TransactionBuilder.fromXDR(body.xdr, passphrase);
    if (parsed instanceof FeeBumpTransaction) {
      return json(400, { error: 'Expected an inner transaction, not a fee bump' });
    }
    inner = parsed;
  } catch {
    return json(400, { error: 'Invalid transaction XDR' });
  }

  const sponsor = Keypair.fromSecret(secret);

  // Abuse limits: only marketplace calls, signed by a user account, under the fee cap.
  if (invokedContract(inner) !== contractId) {
    return json(403, { error: 'Only single marketplace contract calls are sponsored' });
  }
  if (inner.source === sponsor.publicKey()) {
    return json(403, { error: 'Sponsor account cannot be the transaction source' });
  }
  if (inner.signatures.length === 0) {
    return json(400, { error: 'Transaction must be signed by its source account' });
  }

  let feeBump: FeeBumpTransaction;
  try {
    feeBump = TransactionBuilder.buildFeeBumpTransaction(
      sponsor,
      FEE_BUMP_BASE_FEE,
      inner,
      passphrase,
    );
  } catch {
    return json(400, { error: 'Inner transaction fee rate is above the sponsored rate' });
  }
  const fee = BigInt(feeBump.fee);
  if (fee > MAX_FEE_STROOPS) {
    return json(403, {
      error: `Fee ${fee} exceeds the sponsored maximum of ${MAX_FEE_STROOPS} stroops`,
    });
  }

  const now = Date.now();
  if (isRateLimited(inner.source, now)) {
    return json(429, { error: 'Sponsored transaction rate limit reached for this account' });
  }
  if (remainingBudget(now) < fee) {
    return json(429, { error: 'Daily fee sponsorship budget exhausted' });
  }

  feeBump.sign(sponsor);

  const rpc = new SorobanRpc.Server(rpcUrl);
  const result = await rpc.sendTransaction(feeBump);
  if (result.status === 'ERROR') {
    return json(502, { error: 'Network rejected the sponsored transaction' });
  }

  recordSponsored(inner.source, now, fee);
  return json(200, { hash: result.hash });
}
