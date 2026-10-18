import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRialoClient,RIALO_DEVNET_CHAIN,Signature} from '@rialo/ts-cdk';
import {parseReceipt} from '../src/receipt.mjs';
const text=await readFile(new URL('./fixtures/canary-rpc.json',import.meta.url),'utf8');
const signature=JSON.parse(text).result.transaction.signatures[0];
test('official SDK reproduces account_keys parser failure using the recorded live response',async()=>{
  const server=createServer((_q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(text);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const c=createRialoClient({chain:{...RIALO_DEVNET_CHAIN,rpcUrl:`http://127.0.0.1:${server.address().port}`},transport:{timeout:2000,maxRetries:0}});
    await assert.rejects(()=>c.getTransaction(Signature.fromString(signature).toBytes()),/Cannot read properties of undefined/);
  }finally{await new Promise(r=>server.close(r));}
});
test('adapter reads current camelCase and legacy snake_case with identical meaning',()=>{
  const actual=parseReceipt(text,signature);assert.equal(actual.error,null);assert.equal(actual.feeKelvin,'0');assert.equal(actual.blockHeight,'2775152');assert.equal(actual.signerCount,2);
  const legacy=text.replaceAll('accountKeys','account_keys').replaceAll('programIdIndex','program_id_index').replaceAll('numRequiredSignatures','num_required_signatures').replaceAll('validFrom','valid_from').replaceAll('logMessages','log_messages');
  assert.deepEqual(parseReceipt(legacy,signature),actual);
});
test('wrong signature, unsafe numbers, RPC errors and unknown schema cannot be accepted',()=>{
  assert.throws(()=>parseReceipt(text,'wrong'),/identity/);
  assert.throws(()=>parseReceipt(text.replace('2775152','18446744073709551615'),signature),/Unsafe/);
  assert.throws(()=>parseReceipt('{"error":{"code":-1}}',signature));
  assert.throws(()=>parseReceipt(text.replaceAll('accountKeys','unexpectedKeys'),signature));
});
