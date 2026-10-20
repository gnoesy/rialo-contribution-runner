# Receipt outcome classification

Previously, an omitted `meta.err` was normalized to null, which could falsely
look like successful execution. The parser now requires an explicit execution
result. A malformed signature container is also rejected before membership
checks; a string is not a list of transaction signatures.

`inspectReceipt(text, expectedSignature)` is an offline, non-throwing classifier:

| State | Meaning |
| --- | --- |
| `execution_succeeded` | A validated receipt identifies the requested signature and explicitly reports `meta.err: null`. |
| `execution_failed` | A validated receipt identifies the requested signature and reports a non-null execution error. The raw error is preserved. |
| `not_found` | The RPC envelope explicitly returns `result: null`. This does not prove the transaction was never submitted or will never appear. |
| `signature_mismatch` | The receipt's signature list does not contain the expected signature. |
| `rpc_error` | The envelope reports an RPC error; this is not evidence that the transaction itself failed. |
| `invalid_receipt` | Malformed JSON, missing required fields, invalid integer representation or another unsupported shape. |

Only an explicit null execution error is accepted as success. Non-null error
values, including false/zero, are conservatively treated as unsuccessful rather
than interpreted through truthiness. Receipt validation does not verify
finality, cryptographic signatures or protocol-wide schema validity. Transport
failures happen outside this text classifier and must remain unverified.
None of these states authorizes automatic resubmission.

## Evidence provenance

[`canary-rpc.json`](../tests/fixtures/canary-rpc.json) is the recorded successful
Devnet response. [`receipt-cases.json`](../tests/fixtures/receipt-cases.json)
defines synthetic modifications and envelopes for failure tests. These are
deliberately labelled synthetic so they cannot be mistaken for chain activity.
An additional case preserves the RPC error envelope observed on October 20:
both allowlisted Devnet endpoints returned HTTP 404 with code `-32001` and
`Transaction not found`, while `getHealth` still returned `ok`. This is a
current read failure, not evidence that the historically verified transaction
failed. The saved signature and ledger were preserved; no resubmission occurred.
The text classifier labels this explicit error envelope `rpc_error`; the current
HTTP helper rejects non-2xx responses before parsing. HTTP-aware inspection is
separate work in C04.

Run `npm run reproduce:outcomes` for a case-by-case JSON report, or `npm test`
for the full suite. The report's `passed` flag means the expected classification
was reproduced, including expected failure states. These commands do not sign,
send transactions or use a wallet.
