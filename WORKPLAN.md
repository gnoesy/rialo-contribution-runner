# Hourly contribution cycle 1

Goal: publish a useful, reproducible Rialo developer toolkit. Progress measures delivered toolkit work, not points, eligibility, accepted upstream contributions or transaction volume.

The operator's Codex heartbeat runs hourly at minute 10, Asia/Seoul. Each run targets one of the ten equal work units below (10 percentage points). A difficult unit may take more than one run; time passing never earns progress. The existing 15-minute launchd monitor continues independently.

## Work queue and acceptance

| ID | Unit | Evidence needed before completion |
| --- | --- | --- |
| C01 | Standalone offline receipt reproduction | One documented command reproduces the pinned SDK error and shows the adapter result; CLI test passes; source is public. |
| C02 | Strict receipt numeric and required-field validation | Reject malformed, negative, fractional or missing block/fee/validFrom values; recorded camelCase and snake_case receipts still pass; focused tests and explanation are public. |
| C03 | Failed-transaction receipt cases | Fixtures cover successful receipt, execution failure, missing transaction and signature mismatch; CLI/report distinguishes these accurately; no signing; public tests. |
| C04 | Read-only receipt inspection command | Explicit allowlisted Devnet URL and signature input; normalized output and nonzero failure status; tests prove arbitrary RPC URLs are rejected; published usage example. |
| C05 | ERMAC prerequisite diagnostic | Public command explains each missing, unknown, non-executable or wrong-owner prerequisite separately; fixture tests; no creation or signing; public evidence. |
| C06 | Offline ERMAC instruction verification | Compare serialized instruction layout against the pinned public app with deterministic fixtures; negative cases for changed hash or invalid inputs; public reproducible report, without claiming live feed success. |
| C07 | AGP schedule change detector | Fixture-driven added/removed/changed schedule comparison; empty agenda distinguished from fetch failure; no registration/betting; public command and tests. |
| C08 | Reproducible CI | GitHub workflow runs offline tests on clean Node 22 install with no secrets/wallet/network writes; actual successful run URL recorded. Existing live worker stays untouched. |
| C09 | Developer quickstart and contribution route | English/Korean guide verified from a clean checkout; accurate supported/unsupported operations; official submission/contact routes checked with URLs and dates, inaccessible routes labelled; no messages sent. |
| C10 | Versioned developer toolkit release | Review all units, run relevant suite in clean checkout, publish reproducible version/tag and changelog in the existing repository, confirm remote artifacts; document remaining upstream acceptance and reward uncertainty. |

## How each hourly run works

1. Read `reports/contribution-progress.json`, this plan and the last run in ignored `runtime/hourly/`. Inspect git status and the live monitor health.
2. Use a local hour key in Asia/Seoul. Do not start a duplicate unit if that hour already completed one, or if another contributor is still working. Recover interrupted work by inspecting its files and evidence, not assuming it succeeded.
3. Pick the first runnable incomplete unit. Target one verified unit in roughly 20–30 minutes. If blocked, record the specific dependency and choose another independent unit. Do not repeatedly wait for ERMAC availability.
4. Implement the actual artifact, run relevant tests, inspect the staged diff for secrets and unrelated edits, commit and push only approved project files to `gnoesy/rialo-contribution-runner`. Coordinate publication with the same `runtime/publisher` lock used by `src/publish.mjs`. No force push, no empty commits and no activity-padding changes.
5. Confirm the commit exists on the remote. Only then set that unit to `done` with its immutable commit URL, test evidence and timestamp. Publish `reports/contribution-progress.json`. A local artifact alone is not delivered. Unit weights are 10 each; completed weight / 100 is the progress.
6. Save a local run record with hour key, selected unit, outcome, tests, commit, blocker, progress before/after and next task. Failed or blocked units do not add progress. Public progress must not contain private config, credentials, signing data or local wallet paths.
7. Report actual delivered units and links concisely. Monitoring without a deliverable is zero contribution progress. At the end of a cycle, retain its completed record and define the next cycle from real unresolved needs; do not reset or invent tasks just to meet a percentage.

## Existing operating constraints

Preserve `runtime/ledger.json`, the single existing development wallet, one-time faucet and fee caps, allowlisted Devnet RPCs and the already-verified canary. This toolkit work does not need a wallet. The live worker alone retains its approved conditional one-time ERMAC operation. Never resubmit uncertain signed transactions; reconcile the saved signature.

No mainnet spending, betting, multiple identities, claims, relinking, key uploads, X/Discord messages or authentication/private-beta bypass. No upstream issues, comments or messages are sent without explicit authorization. Publishing technical artifacts in the existing user repository is in scope; team acceptance and rewards remain unverified.

The daily official-source review remains due once per Korea calendar day; run it during the first available hourly session after 09:00 and preserve inaccessible-source caveats. Update the existing owner-private dashboard for verified contribution milestones or material changes with the Sites skill; retain step IDs and D1 user completion records. Never mark the user's participation tasks complete.
