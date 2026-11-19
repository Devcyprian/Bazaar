/**
 * Fiat on-ramp / off-ramp via a SEP-24 anchor.
 *
 * Flow: resolve the anchor's stellar.toml -> authenticate with SEP-10 (the
 * challenge transaction is verified, then signed in the user's wallet) ->
 * request an interactive deposit/withdraw URL for USDC, which the anchor's
 * own UI then takes over (KYC, bank details, etc.).
 *
 * Behind the `VITE_ENABLE_FIAT_RAMP` feature flag. The anchor is selected with
 * `VITE_SEP24_ANCHOR_DOMAIN` (defaults to the SDF test anchor).
 */

import { StellarToml, WebAuth } from '@stellar/stellar-sdk';

export const isFiatRampEnabled = import.meta.env.VITE_ENABLE_FIAT_RAMP === 'true';

export const SEP24_ANCHOR_DOMAIN: string =
  import.meta.env.VITE_SEP24_ANCHOR_DOMAIN || 'testanchor.stellar.org';

export type Sep24Kind = 'deposit' | 'withdraw';

type SignFn = (xdr: string, opts?: any) => Promise<string>;

/** Returns the anchor's interactive URL for a USDC deposit or withdrawal. */
export async function getSep24InteractiveUrl(
  kind: Sep24Kind,
  account: string,
  networkPassphrase: string,
  signTransaction: SignFn,
): Promise<string> {
  const toml = await StellarToml.Resolver.resolve(SEP24_ANCHOR_DOMAIN);
  const transferServer = toml.TRANSFER_SERVER_SEP0024;
  const authEndpoint = toml.WEB_AUTH_ENDPOINT;
  const signingKey = toml.SIGNING_KEY;
  if (!transferServer || !authEndpoint || !signingKey) {
    throw new Error(`${SEP24_ANCHOR_DOMAIN} does not support SEP-24.`);
  }

  // SEP-10: fetch the challenge, verify it really comes from the anchor, sign it.
  const challengeRes = await fetch(`${authEndpoint}?account=${encodeURIComponent(account)}`);
  if (!challengeRes.ok) throw new Error('Failed to get an authentication challenge from the anchor.');
  const { transaction } = await challengeRes.json();
  WebAuth.readChallengeTx(
    transaction,
    signingKey,
    networkPassphrase,
    SEP24_ANCHOR_DOMAIN,
    new URL(authEndpoint).hostname,
  );
  const signedChallenge = await signTransaction(transaction, { networkPassphrase });

  const tokenRes = await fetch(authEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedChallenge }),
  });
  if (!tokenRes.ok) throw new Error('Anchor authentication failed.');
  const { token } = await tokenRes.json();

  // SEP-24: start the interactive flow.
  const body = new FormData();
  body.append('asset_code', 'USDC');
  body.append('account', account);
  const res = await fetch(`${transferServer}/transactions/${kind}/interactive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`The anchor could not start the ${kind}.`);
  const { url } = await res.json();
  return url;
}
