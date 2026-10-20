// Offline reproduction: a loopback fixture server, never a wallet or public RPC.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRialoClient, RIALO_DEVNET_CHAIN, Signature} from '@rialo/ts-cdk';
import {parseReceipt} from './receipt.mjs';

export async function reproduceReceipt() {
  const text = await readFile(new URL('../tests/fixtures/canary-rpc.json', import.meta.url), 'utf8');
  const signature = JSON.parse(text).result.transaction.signatures[0];
  const server = createServer((_request, response) => {
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(text);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let sdkError = null;
  try {
    const client = createRialoClient({
      chain: {...RIALO_DEVNET_CHAIN, rpcUrl: `http://127.0.0.1:${server.address().port}`},
      transport: {timeout: 2000, maxRetries: 0},
    });
    try { await client.getTransaction(Signature.fromString(signature).toBytes()); }
    catch (error) { sdkError = error.message; }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  const receipt = parseReceipt(text, signature);
  const reproduced = sdkError !== null && /Cannot read properties of undefined/.test(sdkError);
  return {
    schemaVersion: 1,
    mode: 'offline_fixture',
    sdkVersion: '0.18.1',
    fixture: 'tests/fixtures/canary-rpc.json',
    fixtureSource: 'Recorded Devnet getTransaction response, 2026-10-18',
    publicNetworkRequests: 0,
    transactionsSubmitted: 0,
    sdk: {expectedFailureReproduced: reproduced, error: sdkError},
    adapter: {passed: receipt.error === null && receipt.blockHeight === '2775152', receipt},
    passed: reproduced && receipt.error === null && receipt.blockHeight === '2775152',
    limitation: 'Recorded-response compatibility reproduction; not a fresh live-chain check or contribution reward.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await reproduceReceipt();
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`Receipt reproduction failed: ${error.message}`);
    process.exitCode = 1;
  }
}
