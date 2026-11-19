/**
 * useProfile – persists off-chain display name, email, and bio in localStorage
 * keyed by the connected Stellar public key so each wallet has its own record.
 *
 * The hook provides:
 *   - `profile`         – the current saved values (or empty strings on first use)
 *   - `saveProfile`     – writes new values to localStorage and returns immediately
 *   - `clearProfile`    – removes the stored record for the active public key
 *
 * Storage strategy: localStorage was chosen because it is universally available
 * without any server round-trip, keeps user data fully local (no off-chain
 * service dependency), and is sufficient for the display-name / bio use-case
 * where the data is purely cosmetic and does not need cross-device sync.
 * A future migration to a DID / Ceramic profile service can be done by
 * swapping the read/write helpers below while keeping the hook API intact.
 */

import { useState, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AgentMetadataSchema, type AgentMetadata } from '@/lib/agentMetadata';

export interface UserProfile {
  displayName: string;
  email: string;
  bio: string;
}

/** Number of IDs requested per page from paginated contract query functions. */
export const PAGE_SIZE = 20;

/**
 * Builds the `getNextPageParam` callback for a paginated contract query.
 *
 * Contract query functions now accept `(offset, limit)` and return a slice of
 * the stored ID list. We treat the accumulated number of fetched IDs as the
 * next offset, and stop paging once a short (or empty) page is returned.
 */
export function getNextPageParam(
  lastPage: readonly unknown[],
  allPages: readonly (readonly unknown[])[],
): number | undefined {
  if (lastPage.length !== PAGE_SIZE) return undefined;
  return allPages.reduce((total, page) => total + page.length, 0);
}

/**
 * Wraps a paginated contract query (e.g. `get_jobs_by_client`,
 * `get_bids_by_job`, `get_reviews_by_reviewee`) in `useInfiniteQuery` so
 * consumers get `fetchNextPage` / `hasNextPage` for infinite scroll.
 *
 * `queryKey` should include every argument that identifies the query so
 * different clients/agents/jobs get independent caches.
 */
export function usePaginatedContractQuery<T>(
  queryKey: readonly unknown[],
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Default IPFS gateway used to resolve `ipfs://<cid>` metadata URIs.
 * Override with `VITE_IPFS_GATEWAY` (e.g. a dedicated pinning gateway).
 */
const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

function resolveMetadataUrl(uri: string): string | null {
  const trimmed = uri.trim();
  if (trimmed.startsWith('ipfs://')) {
    const gateway =
      (import.meta.env?.VITE_IPFS_GATEWAY as string | undefined) ?? DEFAULT_IPFS_GATEWAY;
    const base = gateway.endsWith('/') ? gateway : `${gateway}/`;
    return `${base}${trimmed.slice('ipfs://'.length).replace(/^\/+/, '')}`;
  }
  if (trimmed.startsWith('https://')) return trimmed;
  return null;
}

/**
 * Fetches an agent's `metadata_uri`, resolves it (IPFS gateway or https),
 * and validates the JSON with `AgentMetadataSchema` before returning it.
 *
 * Returns `null` for missing/invalid URIs, failed fetches, or JSON that does
 * not satisfy the schema, so callers can render a graceful fallback instead
 * of unvalidated data.
 */
export function useAgentMetadata(metadataUri: string | null | undefined) {
  const url = metadataUri ? resolveMetadataUrl(metadataUri) : null;

  const query = useQuery<AgentMetadata | null>({
    queryKey: ['agent-metadata', url],
    enabled: Boolean(url),
    queryFn: async () => {
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Metadata fetch failed (${res.status})`);
      const json: unknown = await res.json();
      const parsed = AgentMetadataSchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    },
    // Metadata is immutable per URI; avoid refetching on every mount.
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    metadata: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}

const EMPTY_PROFILE: UserProfile = { displayName: '', email: '', bio: '' };

function storageKey(publicKey: string): string {
  return `agentmarket:profile:${publicKey}`;
}

function readProfile(publicKey: string | null): UserProfile {
  if (!publicKey) return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(storageKey(publicKey));
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      displayName: parsed.displayName ?? '',
      email: parsed.email ?? '',
      bio: parsed.bio ?? '',
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function useProfile(publicKey: string | null) {
  const [profile, setProfile] = useState<UserProfile>(() => readProfile(publicKey));

  // Re-read whenever the connected wallet changes
  useEffect(() => {
    setProfile(readProfile(publicKey));
  }, [publicKey]);

  const saveProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      if (!publicKey) return;
      const next: UserProfile = { ...profile, ...updates };
      try {
        localStorage.setItem(storageKey(publicKey), JSON.stringify(next));
      } catch {
        // localStorage may be full or unavailable in private-browsing mode;
        // silently degrade – the in-memory state update still goes through.
      }
      setProfile(next);
    },
    [publicKey, profile],
  );

  const clearProfile = useCallback(() => {
    if (!publicKey) return;
    localStorage.removeItem(storageKey(publicKey));
    setProfile(EMPTY_PROFILE);
  }, [publicKey]);

  return { profile, saveProfile, clearProfile };
}
