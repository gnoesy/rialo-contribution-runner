# Rialo developer toolkit quickstart

[한국어](QUICKSTART.ko.md) · Checked: 2026-10-20

This is an independent community reproduction and diagnostic toolkit. Published
code and passing tests do not establish official acceptance or reward credit.

## 1. Reproduce without a wallet

Use Node.js **22** and Git in a new directory. Do not copy an existing bot's
wallet configuration or transaction ledger.

```sh
git clone https://github.com/gnoesy/rialo-contribution-runner.git
cd rialo-contribution-runner
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run --silent reproduce:receipt
npm run --silent reproduce:outcomes
npm run --silent verify:ermac
node src/diagnose-ermac.mjs --snapshot tests/fixtures/ermac-ready-synthetic.json
node src/agp-schedule.mjs --before tests/fixtures/agp-before.json --after tests/fixtures/agp-after.json
```

Dependency installation needs internet access. Subsequent commands use recorded
or synthetic inputs; the receipt reproduction uses loopback networking. The
current suite has 57 tests, and all five CLI examples exit 0. Future revisions
may add tests.

| Output | Meaning |
| --- | --- |
| Receipt reproduction `passed: true` | Pinned SDK parser issue and adapter reproduced |
| Outcome classifier `passed: true` | Expected fixture outcomes, including failures/unknowns, match |
| ERMAC wire `passed: true` | Fixed bytes match a manually transcribed public app layout |
| Synthetic ERMAC `ready: true` | Synthetic input passes; no evidence of a deployed live program |
| AGP example `state: changed` | Fictional added/removed/changed events detected, not a real race offer |

## 2. Read public state

These commands contact public services and are separate from the offline examples.

```sh
node src/runner.mjs --public
node src/diagnose-ermac.mjs --rpc https://devnet.rialo.io:4101
node src/agp-schedule.mjs --before runtime/agp-baseline.json --live
```

The first command writes `runtime/latest.json` and initializes a baseline after
a successful agenda read. `--public` ignores local wallet configuration. If no
agenda read succeeds, the baseline file will not exist: inspect the read result
before running the last command. Diagnostic exit 1 can mean blocked or unknown
prerequisites; it does not mean a transaction was executed and failed.

The October 20 check found missing ERMAC programs/registry and an empty AGP
agenda. Run a fresh read to establish current conditions.

For an existing receipt, use `inspect:receipt -- --rpc URL --signature SIGNATURE`.
Only `https://devnet.rialo.io:4101` and `https://devnet.rialo.io` are allowed.
Do not resubmit an existing transaction because its receipt is missing or an RPC
query fails.

## 3. Route a contribution

The [official developer portal](https://www.rialo.io/for-devs) links to
[Discord](https://discord.gg/RialoProtocol), [docs](https://docs.rialo.io) and
[Playground](https://playground.rialo.io). **The Discord entry link is verified;
a specific submission channel, form or reward rule is not.** This toolkit does
not post to Discord.

1. Prepare an immutable commit link, reproduction command, Node/SDK versions,
   expected result and observed result.
2. Open Discord through the official portal and check the current submission
   instructions and announcements yourself.
3. Deliver only through the confirmed route. Do not invent a channel name or
   mark a contribution as submitted without evidence.

The npm metadata for SDK `0.18.1` identifies
[`SubzeroLabs/rialo/issues`](https://github.com/SubzeroLabs/rialo/issues) as its
bug route, but this public check returned **404**. That does not determine
whether it is private or removed, and it is not a verified public intake route.
`docs.rialo.io` redirected to an access login. Public Playground text did not
establish submission instructions. The accessible
[Rust CDK docs](https://docs.rs/rialo-cdk/latest/rialo_cdk/) are a technical
reference, not proof of a contribution intake channel.

[The verification record](../reports/2026-10-20-c09-quickstart.json) records
URLs and access states. No external issue, comment or message was sent.

## Supported scope and current limits

- Supported: offline reproduction, read-only queries, ERMAC prerequisites and
  agenda change detection.
- This quickstart does not load wallets, register, sign, transfer, bet, claim,
  link accounts or bypass access controls.
- Synthetic fixtures, test tokens and toolkit progress are not official points.
- GitHub CI (C08) is incomplete: the current connection lacks `workflow` write
  scope and its upload was rejected. Successful local checks are not presented
  as a successful GitHub run.
