# Required receipt integer fields

The compatibility adapter previously converted receipt fields with `String()`.
For example, a missing `transaction.validFrom` could become `"undefined"`, while
`meta.fee: null` became `"null"` and negative numbers were accepted. A readable
string was therefore not sufficient evidence of a valid receipt field.

`parseReceipt` now requires `fee`, `block_height`/`blockHeight`, and
`validFrom`/`valid_from`. Each must be a non-negative safe JavaScript integer or a
canonical unsigned decimal string (`0` or digits without leading zeroes).
Normalization returns decimal strings without rounding. Large integer strings
remain exact; unsafe JSON numbers are rejected because parsing may already have
lost precision.

Missing values, null, booleans, arrays/objects, negative values, fractions,
whitespace, signs, hexadecimal strings, exponent strings, and non-canonical
leading zeroes are rejected. If both supported aliases occur, both must be valid
and normalize to the same value. A valid alias cannot hide an invalid value.

Zero is allowed, including zero fees and the Unix epoch. This adapter checks the
representation; it does not add an undocumented protocol integer-width limit,
assert finality, or imply success from these fields alone. Existing execution
error and identity handling is retained. Duplicate identical JSON property names
are not detected by this JSON.parse-based adapter.

## Reproduce

```sh
node --test tests/receipt-fields.test.mjs tests/receipt.test.mjs
npm test
npm run reproduce:receipt
```

The tests mutate the recorded public Devnet response, exercise each required
field, preserve camelCase/snake_case compatibility, and check numeric boundaries
and conflicting aliases. The recorded response is in
[`tests/fixtures/canary-rpc.json`](../tests/fixtures/canary-rpc.json).
These checks need no wallet or new transaction.
