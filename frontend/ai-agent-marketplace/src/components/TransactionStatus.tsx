import React from 'react';
import { CheckCircle2, ExternalLink, Loader2, X, XCircle } from 'lucide-react';
import { explorerTxUrl, useTxTracker, type TxStatus } from '@/lib/txTracker';

const STATUS_LABEL: Record<TxStatus, string> = {
  pending: 'Pending',
  success: 'Confirmed',
  failed: 'Failed',
};

const StatusIcon: React.FC<{ status: TxStatus }> = ({ status }) => {
  if (status === 'pending') {
    return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" aria-hidden="true" />;
  }
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />;
  }
  return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
};

/** Floating list of recent transactions with their status and explorer links (#184). */
export const TransactionStatus: React.FC = () => {
  const { txs, dismiss } = useTxTracker();
  const recent = txs.slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <aside
      className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg"
      aria-label="Recent transactions"
    >
      <h2 className="border-b px-4 py-2 text-sm font-semibold">Transactions</h2>
      <ul className="divide-y" aria-live="polite">
        {recent.map((tx) => (
          <li key={tx.hash} className="flex items-center gap-3 px-4 py-2 text-sm">
            <StatusIcon status={tx.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium capitalize">{tx.label.replace(/_/g, ' ')}</p>
              <a
                href={explorerTxUrl(tx.hash, tx.networkPassphrase)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                {STATUS_LABEL[tx.status]} · {tx.hash.slice(0, 8)}…{tx.hash.slice(-4)}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
            {tx.status !== 'pending' && (
              <button
                onClick={() => dismiss(tx.hash)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Dismiss ${tx.label} transaction`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
};
