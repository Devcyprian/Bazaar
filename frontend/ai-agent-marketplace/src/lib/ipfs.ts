import { z } from 'zod';

/**
 * IPFS upload utilities.
 *
 * Supports two pinning backends, chosen by the VITE_IPFS_PROVIDER env var
 * (defaults to "pinata"):
 *   - "pinata"        → POST to https://api.pinata.cloud/pinning/pinFileToIPFS
 *   - "web3storage"   → POST to https://api.web3.storage/upload  (v1 API)
 *
 * Both backends require VITE_IPFS_API_KEY.
 * The public gateway used for building read-URLs is VITE_IPFS_GATEWAY.
 *
 * An optional generic pinning service can be configured via
 * VITE_PINNING_ENDPOINT (POSTs JSON, expects { cid } or { IpfsHash }).
 *
 * For agent metadata we upload a JSON object.
 * For deliverable files we upload the raw File / Blob.
 */

export const IPFS_GATEWAY =
  import.meta.env.VITE_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/';

const IPFS_API_KEY = import.meta.env.VITE_IPFS_API_KEY ?? '';
const IPFS_PROVIDER: string =
  (import.meta.env.VITE_IPFS_PROVIDER as string | undefined) ?? 'pinata';
const PINNING_ENDPOINT: string =
  (import.meta.env.VITE_PINNING_ENDPOINT as string | undefined) ?? '';

export interface UploadProgress {
  /** 0–100, or null while the XHR / fetch is in flight without progress info */
  percent: number | null;
  status: 'idle' | 'uploading' | 'done' | 'error';
  cid?: string;
  error?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Convert an IPFS URI (ipfs://Qm…) to a gateway HTTP URL. */
export function ipfsUriToUrl(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY}${uri.slice(7)}`;
  }
  // Already an HTTP URL – return as-is.
  return uri;
}

/** True when the app has an API key configured. */
export function isIpfsConfigured(): boolean {
  return IPFS_API_KEY.length > 0;
}

/** True when a generic pinning endpoint is configured. */
export function isPinningEndpointConfigured(): boolean {
  return PINNING_ENDPOINT.length > 0;
}

// ── metadata schema & validation ───────────────────────────────────────────────

/**
 * URI validator: accepts only `ipfs://…` or `https://…` URIs.
 */
export const metadataUriSchema = z
  .string()
  .trim()
  .min(1, 'Metadata URI is required')
  .refine(
    (uri) => uri.startsWith('ipfs://') || uri.startsWith('https://'),
    'Metadata URI must start with ipfs:// or https://',
  );

/** True when `uri` is a valid metadata URI (ipfs:// or https://). */
export function isValidMetadataUri(uri: string): boolean {
  return metadataUriSchema.safeParse(uri).success;
}

const httpUrlSchema = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .refine(
    (url) => url.startsWith('https://') || url.startsWith('http://'),
    'Must be an http(s) URL',
  );

/**
 * Zod schema for agent metadata stored at `metadata_uri`.
 */
export const agentMetadataSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(2000).optional(),
  avatar: metadataUriSchema.optional(),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(50),
        url: httpUrlSchema,
      }),
    )
    .max(20)
    .optional(),
  portfolio: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        url: httpUrlSchema,
      }),
    )
    .max(50)
    .optional(),
});

export type AgentMetadata = z.infer<typeof agentMetadataSchema>;

export type ParseAgentMetadataResult =
  | { ok: true; data: AgentMetadata }
  | { ok: false; error: string };

/**
 * Validate unknown data against the agent metadata schema.
 * Returns a typed result instead of throwing.
 */
export function parseAgentMetadata(input: unknown): ParseAgentMetadataResult {
  const result = agentMetadataSchema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const error = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return { ok: false, error };
}

/**
 * Format a CID as a full IPFS URI: "ipfs://<cid>"
 */
export function cidToUri(cid: string): string {
  return `ipfs://${cid}`;
}

// ── upload implementations ─────────────────────────────────────────────────────

async function uploadViaPinata(file: File | Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, filename);
  form.append(
    'pinataMetadata',
    JSON.stringify({ name: filename }),
  );
  form.append(
    'pinataOptions',
    JSON.stringify({ cidVersion: 1 }),
  );

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IPFS_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${body}`);
  }

  const json = await res.json() as { IpfsHash: string };
  return json.IpfsHash;
}

async function uploadViaWeb3Storage(file: File | Blob, filename: string): Promise<string> {
  const res = await fetch('https://api.web3.storage/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IPFS_API_KEY}`,
      'X-Name': filename,
    },
    body: file,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`web3.storage upload failed (${res.status}): ${body}`);
  }

  const json = await res.json() as { cid: string };
  return json.cid;
}

// ── public API ─────────────────────────────────────────────────────────────────

/**
 * Upload any File/Blob to IPFS and return the CID.
 *
 * @param file     File or Blob to pin
 * @param filename Human-readable filename stored in pinning metadata
 * @param onProgress Optional callback (not all providers support granular %)
 */
export async function uploadToIpfs(
  file: File | Blob,
  filename: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  onProgress?.({ percent: null, status: 'uploading' });

  let cid: string;
  try {
    if (IPFS_PROVIDER === 'web3storage') {
      cid = await uploadViaWeb3Storage(file, filename);
    } else {
      // default: Pinata
      cid = await uploadViaPinata(file, filename);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({ percent: null, status: 'error', error: message });
    throw err;
  }

  onProgress?.({ percent: 100, status: 'done', cid });
  return cid;
}

/**
 * Upload a plain JS object as JSON to IPFS.
 * Returns the CID string.
 */
export async function uploadJsonToIpfs(
  data: Record<string, unknown>,
  filename = 'metadata.json',
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  return uploadToIpfs(blob, filename, onProgress);
}

/**
 * Upload a JSON object to the configured generic pinning service
 * (VITE_PINNING_ENDPOINT) and return a full `ipfs://<cid>` URI.
 *
 * The endpoint is expected to accept a JSON body and respond with either
 * `{ cid }` or `{ IpfsHash }`.
 */
export async function uploadJsonToPinningService(
  data: Record<string, unknown>,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  if (!PINNING_ENDPOINT) {
    throw new Error('Pinning endpoint is not configured (VITE_PINNING_ENDPOINT)');
  }

  onProgress?.({ percent: null, status: 'uploading' });

  let cid: string;
  try {
    const res = await fetch(PINNING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(IPFS_API_KEY ? { Authorization: `Bearer ${IPFS_API_KEY}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Pinning service upload failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { cid?: string; IpfsHash?: string };
    const resultCid = json.cid ?? json.IpfsHash;
    if (!resultCid) {
      throw new Error('Pinning service response did not include a CID');
    }
    cid = resultCid;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({ percent: null, status: 'error', error: message });
    throw err;
  }

  onProgress?.({ percent: 100, status: 'done', cid });
  return cidToUri(cid);
}

/**
 * Compute the SHA-256 hash of a File/Blob and return it as a Uint8Array.
 * This is the value passed to `client.submitDeliverable()` as the on-chain
 * 32-byte proof hash.
 */
export async function sha256OfFile(file: File | Blob): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(digest);
}
