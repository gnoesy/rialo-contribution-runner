# Reproduce v1.0.0

This GitHub source release uses Node **22**, Git and gzip. No npm publication,
wallet setup, signing or live RPC operation is needed to verify it.

## Check the tagged source

```sh
git clone --branch v1.0.0 --depth 1 https://github.com/gnoesy/rialo-contribution-runner.git
cd rialo-contribution-runner
git rev-parse 'v1.0.0^{commit}'
npm ci --ignore-scripts --no-audit --no-fund
npm run check:offline
```

Expected: 57 passing tests and five passing offline CLI checks. Installation
needs internet access. The receipt reproduction needs local loopback sockets.
The local check script does not itself isolate networking; the GitHub CI job
runs it in a loopback-only Linux network namespace. It refuses local wallet
configuration or the live transaction ledger in the checkout.

## Verify downloaded source bytes

Download `rialo-contribution-runner-v1.0.0.tar.gz` and `SHA256SUMS` from the
[v1.0.0 release](https://github.com/gnoesy/rialo-contribution-runner/releases/tag/v1.0.0)
into the same directory. On macOS:

```sh
shasum -a 256 -c SHA256SUMS
```

On Linux use `sha256sum -c SHA256SUMS`. The checksum detects corruption or a
mismatch; it is not a developer signature or an upstream endorsement. This tag
is annotated, not cryptographically signed.

To independently regenerate the attached archive from a clone:

```sh
set -o pipefail
git -c tar.umask=0022 archive --format=tar \
  --prefix=rialo-contribution-runner-v1.0.0/ 'v1.0.0^{commit}' \
  | gzip -n -9 > rialo-contribution-runner-v1.0.0.tar.gz
shasum -a 256 rialo-contribution-runner-v1.0.0.tar.gz
```

Use the **peeled commit**, as above, so an annotated tag's metadata does not
change archive timestamps. Git supplies the commit timestamp; `gzip -n` omits
its filename and timestamp. The recorded release evidence includes Git/gzip
versions used for the byte comparison. If a different archiver version yields
different bytes, inspect the exact Git commit and extracted contents; do not
silently substitute the release checksum. GitHub's automatically generated
source ZIP/tarball is separate from the explicitly attached archive.

The archive is made from tracked files at the release commit, so it excludes
ignored local config, runtime, wallets, installed dependencies and Git metadata.
The release was verified by extracting that archive into a new directory,
installing locked dependencies and running the offline checks there.

## Evidence and continuing operation

[Live completion record](../reports/contribution-progress.json) and
[release validation report on main](https://github.com/gnoesy/rialo-contribution-runner/blob/main/reports/2026-10-22-c10-release.json)
are recorded **after** remote publication succeeds. The tag cannot include its
own eventual commit ID or post-publication checks. A 90% progress snapshot in
the tagged tree is expected; it is not the current main-branch progress.

The existing 15-minute monitor retains its ledger and single-wallet bounds.
Installing this release does not install launchd jobs or request transactions.
Official acceptance, contribution intake and reward rules remain unverified;
see [the changelog](../CHANGELOG.md) and the quickstart's access limitations.
