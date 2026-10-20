# ERMAC wire layout reference

Reviewed 2026-10-20 against the [public helper](https://ermac.rialo.io/assets/frost-public-key-tgtsfZiz.js),
SHA-256 `2e5fc8a9ab654d4ca2067c70d14789da15e17e7656984fa9ff5d9560396890ac`.
The helper was downloaded and hashed, inspected as text, and never executed.
This is a manual protocol transcription, not an official conformance certificate.

The helper's `cn` constructs registry registration followed by subscriber
creation. `nn`/`an` encode registration; `Ut` with `Me` encodes the subscriber
payload. Integers and lengths are little endian. String lengths count UTF-8
bytes. Vectors begin with an unsigned 64-bit element count; each string element
has its own unsigned 64-bit byte length.

| Registration field | Width |
| --- | --- |
| Variant = 1 | 4 bytes |
| Workflow public key | 32 bytes |

| Subscriber creation field | Width |
| --- | --- |
| Variant = 4 | 4 bytes |
| Workflow slug | 32 bytes |
| Topic | u64 byte length + UTF-8 |
| URL | u64 byte length + UTF-8 |
| Aggregator public key | 32 bytes |
| Event PDA | 32 bytes |
| Check interval in seconds | u64 |
| Extraction labels | vector of strings |
| Extraction patterns | vector of strings |

The fixed fixture uses `GNOESY_USDC_USD_V1`, the configured USDC/USD URL,
interval 3600, one label and one pattern. Registration is 36 bytes and creation
243 bytes. Python `struct.pack('<I', ...)`, `struct.pack('<Q', ...)`, UTF-8
encoding and a separate base58 decoder produced the committed reference bytes.
The reference is not regenerated from the implementation during tests.

Registration account order: payer (signer, writable), creator registry
(writable), global registry (writable), system program (read-only).
Creation order: payer (signer, writable), workflow (writable), oracle registry
program, system program, subscriber system program (all read-only),
subscription (writable), rex account (writable).
The verifier reconstructs effective privileges from the compiled message
header; it does not compare unstable account-key indexes.

The workflow slug is the runner's deterministic hash, passed through the app's
supported explicit-slug layout. This differs from the app's default generated
slug. Expected PDA strings were recorded using the pinned SDK; that portion
is a regression fixture, not an independent PDA implementation.

`buildFeed` now accepts an optional explicit `validFrom` for deterministic
unsigned comparisons. Normal worker calls keep the current-time default.
Config hash and timestamp must be positive u64 bigints; strings, numbers,
negative/zero values and overflow fail before building. This representation
validation does not attest a live config hash or a valid transaction time.

Negative tests alter bytes, lengths, programs, account order, privileges and
protocol hash. None submits a transaction. Missing on-chain programs remain
an external blocker, and passing this fixture does not prove live feed creation,
oracle updates, official contribution acceptance or points.
