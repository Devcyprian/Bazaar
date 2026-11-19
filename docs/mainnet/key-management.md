# Mainnet Key Management & Signer Runbook

This runbook defines how the keys that control the AI Agent Marketplace
contract on mainnet are held, used and rotated. It replaces the plain
`stellar keys` CLI identities used on testnet.

## Key Inventory

| Key | Purpose | Custody | Allowed in CI? |
|-----|---------|---------|----------------|
| Deploy key | Pays for `stellar contract deploy` / `initialize` on mainnet | Hardware wallet (Ledger) or cloud KMS (AWS KMS / GCP KMS, Ed25519) | No |
| Admin multisig account | `config.admin` — `set_paused`, `update_config`, denylist, skill verifiers, upgrades | Stellar account with N-of-M signers, each signer on its own hardware wallet | **Never** |
| Admin signers | Individual signers on the admin multisig | One hardware wallet per signer, held by separate people | Never |
| Testnet / rehearsal keys | `REHEARSAL_SECRET_KEY`, testnet deploys | GitHub Environment secrets (`rehearsal`, `testnet`) | Yes |
| Smoke-test account | Runs `scripts/smoke-test.sh` | Dedicated low-balance account, CLI identity on the operator machine | No (mainnet) |

## Rules

1. The mainnet admin is a multisig **account**, not a single key. The contract
   stores its address in `config.admin` at `initialize`; the address never
   changes, only its signers do.
2. No mainnet admin or signer secret is ever stored in GitHub secrets, the
   `mainnet` environment, `.env` files, or the `stellar keys` store. The
   `mainnet` GitHub Environment holds only frontend deploy values
   (`VERCEL_*`, `VITE_*`).
3. The deploy key is used only from a hardware wallet or KMS signer. Its
   account keeps just enough XLM for deploy fees and holds no admin rights.
4. Signers are held by different people. No single person may hold enough
   signer weight to reach the medium/high threshold alone.
5. Every admin transaction is built unsigned, reviewed by each signer, and
   signed on the hardware device (e.g. `stellar ... --build-only`, then sign
   with each signer and submit).

## Admin Multisig Setup

Recommended starting configuration: 3 signers, thresholds low=1, med=2,
high=2, master key weight 0.

1. Create the admin account and fund it.
2. Add each signer's hardware-wallet public key with weight 1 via a
   `set_options` operation (Stellar Laboratory or `stellar tx new set-options`
   built unsigned and signed with the master key).
3. In the same transaction set thresholds (low=1, med=2, high=2) and the
   master weight to 0 so the original secret can no longer sign.
4. Record the account address and signer list in the sign-off table below.
5. Pass the account address as `ADMIN_ADDRESS` to
   `./scripts/init-contract.sh mainnet`.

## Rotation Procedure

Rotate a signer when a device is lost, a signer leaves, or on a scheduled
basis (at least annually).

1. Generate the new signer key on a fresh hardware wallet; share only its
   public key.
2. Build one `set_options` transaction on the admin account that:
   - adds the new signer with weight 1, and
   - sets the outgoing signer's weight to 0 (removes it).
3. Collect the threshold of signatures from the **remaining** signers and
   submit.
4. Verify on-chain: `stellar` / Horizon `GET /accounts/<admin>` shows the new
   signer list and unchanged thresholds.
5. Run a no-op admin action signed with the new set (e.g. `set_paused false`
   while unpaused) to prove the new signer can participate.
6. Update the signer table below and wipe the retired device.

Deploy key rotation: generate a new hardware/KMS key, fund it, move the
remaining XLM out of the old account, and update the operator runbook. No
contract change is needed because the deploy key holds no admin rights.

Compromise response: if a signer is suspected compromised, pause the contract
first (`set_paused true`, see [incident runbook](../incidents/runbook.md)),
then rotate as above before unpausing.

## Testnet Rotation Drill

The rotation procedure must be exercised on testnet before mainnet use:

1. Create a testnet admin multisig with the configuration above.
2. Deploy and initialize a testnet contract with `ADMIN_ADDRESS` set to it.
3. Perform the rotation procedure, replacing one signer.
4. Confirm the retired signer can no longer authorize `set_paused`, and the
   new signer set can.
5. Record the result below.

| Date | Network | Admin account | Signer rotated | Result | Operator |
|------|---------|---------------|----------------|--------|----------|
| | testnet | | | | |

## Sign-off

| Item | Value |
|------|-------|
| Mainnet admin account | |
| Signers (public keys / holders) | |
| Thresholds (low / med / high) | |
| Deploy key custody (device / KMS key id) | |
| Approved by | |
