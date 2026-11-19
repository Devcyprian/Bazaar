/**
 * Transaction status tracking (#184).
 *
 * Every submitted transaction hash is tracked through pending -> success |
 * failed. The list is persisted to localStorage so transactions that were
 * still pending when the page was refreshed are resumed by StellarProvider.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Networks } from '@stellar/stellar-sdk';

export type TxStatus = 'pending' | 'success' | 'failed';

export interface TrackedTx {
  hash: string;
  /** Contract method that was invoked, e.g. `post_job`. */
  label: string;
  status: TxStatus;
  networkPassphrase: string;
  submittedAt: number;
}

interface TxTrackerState {
  txs: TrackedTx[];
  track: (tx: TrackedTx) => void;
  setStatus: (hash: string, status: TxStatus) => void;
  dismiss: (hash: string) => void;
}

/** Number of transactions kept in history (newest first). */
const MAX_TRACKED = 20;

export const useTxTracker = create<TxTrackerState>()(
  persist(
    (set) => ({
      txs: [],
      track: (tx) =>
        set((state) => ({
          txs: [tx, ...state.txs.filter((t) => t.hash !== tx.hash)].slice(0, MAX_TRACKED),
        })),
      setStatus: (hash, status) =>
        set((state) => ({
          txs: state.txs.map((t) => (t.hash === hash ? { ...t, status } : t)),
        })),
      dismiss: (hash) =>
        set((state) => ({ txs: state.txs.filter((t) => t.hash !== hash) })),
    }),
    { name: 'tracked-transactions' },
  ),
);

/** stellar.expert link for a transaction on the network it was submitted to. */
export function explorerTxUrl(hash: string, networkPassphrase: string): string {
  const network =
    networkPassphrase === Networks.PUBLIC
      ? 'public'
      : networkPassphrase === Networks.FUTURENET
        ? 'futurenet'
        : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}
