# Rialo contribution runner

A reproducible SDK integration probe and readiness monitor for Rialo developers. It runs against real public RPC endpoints, distinguishes unavailable dependencies from network failures, and saves evidence that others can reproduce.

**This is an independent community project. It does not earn or claim guaranteed points or airdrops.** A successful Devnet transaction is a technical test, not proof of accepted contribution credit.

## Current evidence

- [Latest automated status](reports/latest.json): public Devnet/Testnet RPC health, ERMAC program availability and AGP upcoming-race count.
- [Reproduced integration findings](reports/2026-10-18-findings.md).
- A single real Devnet system-account creation was executed and its signature and resulting account checked. See the receipt in the findings report.
- ERMAC creation is gated: the public app's three configured program addresses were absent on the inspected networks on 18 October 2026. The runner does not submit transactions to missing programs.

## Run without a wallet

Node.js 22 or later:

```sh
npm ci --ignore-scripts
npm test
node src/runner.mjs --public
```

Results are written to `runtime/latest.json`. `--public` ignores local wallet configuration and never signs or requests a faucet. Tests cover lossless u64 config hashes, Devnet-only signing, unknown versus absent accounts, program readiness, deterministic transactions, duplicate suppression, fees and execution errors, the reproduced SDK receipt parser failure and its compatibility adapter.

### Reproduce the receipt compatibility issue offline

After dependency installation, run:

```sh
npm run reproduce:receipt
```

This serves the recorded Devnet response on loopback, reproduces the `@rialo/ts-cdk@0.18.1` parsing failure, and prints the successful normalized adapter receipt as JSON. It exits nonzero if the expected result cannot be reproduced. It needs no wallet, faucet or public RPC connection. The fixture is historical evidence, not a fresh network check.

### Distinguish receipt outcomes offline

```sh
npm run reproduce:outcomes
```

This prints seven labelled fixture cases: recorded successful execution, synthetic
execution failure, transaction not found, signature mismatch, RPC error and
missing execution metadata, and an observed RPC transaction-not-found error. Exit zero means the **fixture suite** behaved as
expected, not that every simulated transaction succeeded. Failure cases were
constructed for testing except the explicitly labelled RPC read error; none is a claim of an observed failed transaction.
See [outcome semantics and limits](reports/2026-10-20-receipt-outcomes.md).

## Optional bounded Devnet integration

Copy `config.example.json` to ignored `config.local.json` and enter an **existing** development wallet path and its public address. The original 0600 key file is read only in memory. Neither keys nor raw signed transactions are written into reports or uploaded.

```sh
node src/runner.mjs --canary
```

This explicitly runs one end-to-end account-creation test. It requests at most 0.1 test RLO from the faucet once if necessary; account rent is capped at 0.01 test RLO and estimated fees at 0.001. It creates a deterministic, wallet-controlled zero-data test account. It never repeats the transaction after an ambiguous response. Inspect `runtime/ledger.json` to reconcile uncertainty; do not delete it to force retries.

The normal runner does not repeat the canary. If `autoCreateFeed` is explicitly enabled, it can create **one** hourly USDC/USD ERMAC feed when the pinned app protocol and all program/registry checks pass. The wire serializer was compared byte-for-byte with the public app's helper. Live feed execution remains unverified until those programs are available. Creation does not prove oracle updates; the report only claims transaction/account verification. No global registry initialization, betting, trading, token claims, mainnet transfers, extra farming identities or account-link changes are performed.

## Automation

`node src/service.mjs` runs one bounded check and an optional public-report sync. On the operator's Mac mini, launchd runs this every 15 minutes and on login. Public status is pushed when material status changes or once a day; the publisher allows only the configured project repository and whitelists fields. Private state is never committed.

The operator's hourly Codex routine follows [the contribution work plan](WORKPLAN.md), targeting one verified, published work unit per run. [Contribution progress](reports/contribution-progress.json) is separate from network status and reward eligibility. Public X posts, protected-doc access and opportunities are reviewed once daily. No hidden X API or login bypass is used.

If the Devnet 4101 endpoint is unavailable, the runner can use the official ERMAC app's HTTPS 443 RPC endpoint. Network timeouts remain `unverified`, not `absent`. A changed ERMAC asset blocks automatic deployment for review. The last 192 network snapshots are retained. A failed service or stale report needs investigation, not blind retry of signed work.

## Sources and protocol provenance

- [Official SDK registry](https://registry.npmjs.org/@rialo%2Fts-cdk), pinned `@rialo/ts-cdk@0.18.1` with npm lockfile integrity.
- [Official Rust CDK API](https://docs.rs/rialo-cdk/latest/rialo_cdk/).
- [ERMAC](https://ermac.rialo.io/) public helper `assets/frost-public-key-tgtsfZiz.js`, SHA-256 `2e5fc8a9ab654d4ca2067c70d14789da15e17e7656984fa9ff5d9560396890ac`.
- [AGP agenda](https://api.agp.onlatch.com/track/schedule/agenda).
- [Rechecked X evidence and limits](reports/2026-10-18-research.json).

Protected docs and private repositories are not accessed by this tool. It implements the public RPC/SDK protocol and leaves auth-dependent features unverified.
