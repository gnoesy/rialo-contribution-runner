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

### Inspect an existing Devnet receipt

```sh
npm run --silent inspect:receipt -- \
  --rpc https://devnet.rialo.io:4101 \
  --signature 5UD6CupQHvQhKzNuLszdxyvwjijtHsv3ZnM6oN5JBSgswGMhsxen9LTT5omXc48v8DA9Kvn47PsDh9B9WxkFKBSc
```

This makes one read-only `getTransaction` request, prints normalized JSON and
needs no wallet or local configuration. Both flags are required. The only
accepted URLs are exactly `https://devnet.rialo.io:4101` and
`https://devnet.rialo.io`; redirects and arbitrary endpoints are rejected.
Requests have a 15-second timeout and a 2 MB response limit, with no retries.

Exit **0** means the returned receipt has explicit successful execution.
Exit **1** means unsuccessful execution or an unavailable/invalid read; inspect
`state`, `httpStatus` and `rpcError` to distinguish them. Exit **2** means invalid
arguments. HTTP errors can never produce a successful result, even if their
body resembles a receipt. `rpc_error`, `not_found`, `http_error`,
`transport_error` and `invalid_receipt` do **not** mean the transaction failed.
Do not resubmit a saved transaction based on those states.

The example signature is historical evidence: an RPC may stop serving its
receipt. At the October 20 check it returned HTTP 404 / RPC -32001. Neither that
read failure nor a successful receipt proves finality, contribution acceptance
or rewards. [C04 verification](reports/2026-10-20-c04-inspection.json) records the
live observation separately from the offline tests.

### Diagnose ERMAC prerequisites without a wallet

```sh
npm run --silent diagnose:ermac -- --rpc https://devnet.rialo.io:4101
# Deterministic offline example: synthetic readiness, not a live deployment
npm run --silent diagnose:ermac -- --snapshot tests/fixtures/ermac-ready-synthetic.json
```

The live command checks the selected allowlisted Devnet endpoint and the pinned
public ERMAC asset. Its JSON lists each prerequisite separately:

| Check | Non-passing result | Meaning / next step |
| --- | --- | --- |
| RPC address / health | `address_mismatch`, `unknown`, `unhealthy` | Use an allowed endpoint; investigate connectivity. |
| App protocol | `unknown`, `mismatch` | Public asset unavailable or hash/entrypoint changed; review the public protocol before considering a write. |
| Three programs | `missing` | RPC reports the expected account absent; wait for official deployment information. |
| Three programs | `not_executable` | Account exists but is not an executable program. |
| Program metadata | `unknown`, `address_mismatch` | Lookup/metadata unavailable or observation for the wrong address; do not infer absence. |
| Global registry | `missing`, `unknown`, `address_mismatch` | Registry presence at the expected derived address is not established. |
| Registry owner | `wrong_owner`, `unknown` | Owner differs from the registry program, or ownership cannot be checked. |

Exit 0 means all **listed prerequisites** pass, exit 1 means at least one is
blocked/unknown, and exit 2 means invalid/unreadable command input. An absent
registry also has unknown ownership; these are separate checks, not two
transactions. The command does not read wallet configuration or ledger state,
sign, create accounts, initialize the registry, request a faucet, or change the
live worker. Readiness does not guarantee feed execution or eligibility.

`--snapshot` accepts `{checkedAt, network, bundle}` observations in the same
shape as the fixture. Its output is explicitly labelled `supplied_snapshot`;
it does not refresh the observations or establish that caller-supplied data is
authentic. [C05 verification](reports/2026-10-20-c05-diagnostic.json) separates
the offline synthetic tests from the actual live diagnostic results.

### Verify ERMAC instruction bytes offline

```sh
npm run --silent verify:ermac
# Optional: verify a previously downloaded helper against the exact pinned hash
node src/verify-ermac-wire.mjs --bundle /path/to/frost-public-key-tgtsfZiz.js
```

This compares unsigned instructions against a deterministic fixture transcribed
from the hash-verified public helper: bytes, account order and privileges,
program IDs, derived addresses, payer, config hash and fixed timestamp. It makes
no network request and reads no wallet. Exit 0 means the reference matches;
exit 1 means verification failed; exit 2 means unsupported arguments.

The reference byte strings were encoded independently with Python `struct`,
not generated by `buildFeed`. Expected PDA addresses use the same pinned SDK,
so this is **not an independent cryptographic PDA check or execution of the
official application**. The synthetic payer is a public program address with
no signing key used. [Reviewed wire layout and scope](reports/2026-10-20-ermac-wire-layout.md)
and [verification results](reports/2026-10-20-c06-wire.json) describe what this
proves. No live feed success or reward entitlement is implied.

### Detect AGP schedule changes

```sh
# Offline synthetic examples, not real participation offers
npm run --silent diff:agenda -- --before tests/fixtures/agp-before.json --after tests/fixtures/agp-after.json
# After the public monitor has created a successful agenda baseline:
node src/agp-schedule.mjs --before runtime/agp-baseline.json --live
```

Snapshots contain `{state:"verified_public_api", checkedAt, agenda:[...]}`.
The comparator uses each agenda item's unique string `id`, ignores row/property
ordering and reports added/removed entries plus changed fields. A successful
empty list is valid evidence; network failure, malformed schema, missing IDs
or duplicate IDs leave changes unknown (`null`, not zero). Older timestamped
observations cannot roll back the baseline. The first observation initializes
the baseline without presenting existing entries as newly added opportunities.

The 15-minute runner now retains the last successful list in
`runtime/agp-baseline.json`, records actual differences in
`runtime/agp-changes.jsonl` and exposes only change counts in its public report.
Unknown observations preserve that baseline for the next successful check.
The standalone CLI only reads files/the fixed public agenda URL and prints
JSON; it does not update a baseline, register, bet or use account credentials.
Exit 0 means a verified comparison/initialization, 1 means unknown comparison,
and 2 means invalid command/file input.

Removed means absent from the current agenda response, not proven cancellation.
An explicit `status` change to `cancelled` is reported as a changed field.
Public schedules do not establish personalized eligibility, rewards or a safe
betting strategy. [Schema provenance and verification](reports/2026-10-20-c07-agenda.json)
separate synthetic change cases from observed live empty agendas.

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
