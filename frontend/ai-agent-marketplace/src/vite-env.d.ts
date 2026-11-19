/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IPFS_GATEWAY?: string;
  readonly VITE_IPFS_API_KEY?: string;
  readonly VITE_IPFS_PROVIDER?: string;
  readonly VITE_ENABLE_FIAT_RAMP?: string;
  readonly VITE_SEP24_ANCHOR_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
