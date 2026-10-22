# Changelog

## 1.0.0 — 2026-10-22

First versioned release of the independent Rialo developer toolkit. Requires
Node 22 and pins `@rialo/ts-cdk` to 0.18.1 with lockfile integrity.

### Included

- C01–C03: recorded SDK camelCase/snake_case receipt reproduction, strict
  numeric/required-field validation, and labelled execution/failure/unknown cases.
- C04: read-only, allowlisted Devnet receipt inspection with bounded requests
  and explicit exit states; an unavailable receipt never triggers resubmission.
- C05–C06: per-prerequisite ERMAC diagnostics and deterministic unsigned wire
  fixtures checked against the pinned public application helper.
- C07: AGP agenda added/removed/changed comparison; a failed read preserves the
  last valid baseline and never becomes an empty successful schedule.
- C08: clean Node 22 CI with 57 tests and five CLI checks. CI disables external
  networking after dependency installation and uses no wallet or repo secrets.
- C09: English/Korean quickstarts and checked public contribution entry routes.
- C10: a version tag, source archive, SHA-256 checksum and exact reproduction
  procedure. This is a GitHub source release; npm publication remains disabled.

### Limits at release

- The toolkit is not an official Rialo product or an accepted upstream submission.
  Code delivery, fixture success and Devnet tokens do not establish points,
  airdrop allocation, reward conversion or retroactive eligibility.
- ERMAC live feed execution remains unverified; monitored programs/registry are
  unavailable. A matching synthetic fixture is not a live deployment.
- The historical canary receipt may be unavailable from current RPCs. Its saved
  signature and ledger are retained; it is never recreated for release testing.
- Protected docs and private contribution channels remain unverified. No issue,
  comment, Discord/X message or submission is sent by this release.
- `reports/latest.json` and progress inside the tag are snapshots. Follow `main`
  for current monitoring and post-publication completion evidence.
