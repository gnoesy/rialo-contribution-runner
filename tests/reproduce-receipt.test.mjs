import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

test('standalone reproduction runs outside the repository cwd without wallet configuration', async () => {
  const {stdout, stderr} = await promisify(execFile)(process.execPath, [
    fileURLToPath(new URL('../src/reproduce-receipt.mjs', import.meta.url)),
  ], {cwd: '/tmp', timeout: 10000});
  const result = JSON.parse(stdout);
  assert.equal(stderr, '');
  assert.equal(result.passed, true);
  assert.equal(result.mode, 'offline_fixture');
  assert.equal(result.sdk.expectedFailureReproduced, true);
  assert.equal(result.adapter.receipt.blockHeight, '2775152');
});
