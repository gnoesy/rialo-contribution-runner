import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {inspectReceipt,parseReceipt} from '../src/receipt.mjs';
import {reproduceOutcomes} from '../src/reproduce-outcomes.mjs';
const original=JSON.parse(await readFile(new URL('./fixtures/canary-rpc.json',import.meta.url),'utf8'));
const signature=original.result.transaction.signatures[0];

test('recorded success, observed RPC error and five synthetic cases are distinguished',async()=>{
  const result=await reproduceOutcomes();
  assert.equal(result.passed,true);
  assert.deepEqual(result.cases.map(c=>c.actual),['execution_succeeded','execution_failed','not_found','signature_mismatch','rpc_error','invalid_receipt','rpc_error']);
});
test('execution errors are preserved and explicit null alone represents success',()=>{
  for(const error of [{InstructionError:[0,{Custom:1}]},'SyntheticError',false,0,[]]){
    const r=structuredClone(original);r.result.meta.err=error;
    const result=inspectReceipt(JSON.stringify(r),signature);
    assert.equal(result.state,'execution_failed');
    assert.deepEqual(result.receipt.error,error);
  }
  const r=structuredClone(original);delete r.result.meta.err;
  assert.throws(()=>parseReceipt(JSON.stringify(r),signature),/Missing execution result/);
  assert.equal(inspectReceipt(JSON.stringify(r),signature).state,'invalid_receipt');
});
test('malformed envelopes and signature containers never become successful execution',()=>{
  for(const text of ['broken','null','[]','{}','{"result":false}','{"result":{}}']){
    assert.equal(inspectReceipt(text,signature).state,'invalid_receipt');
  }
  const r=structuredClone(original);r.result.transaction.signatures=signature;
  assert.equal(inspectReceipt(JSON.stringify(r),signature).state,'invalid_receipt');
  r.result.transaction.signatures=[null];
  assert.equal(inspectReceipt(JSON.stringify(r),signature).state,'invalid_receipt');
});
test('RPC error takes precedence over a simultaneous result; absent result is not not-found',()=>{
  const r=structuredClone(original);r.error={code:-32603};
  assert.equal(inspectReceipt(JSON.stringify(r),signature).state,'rpc_error');
  assert.equal(inspectReceipt('{"jsonrpc":"2.0"}',signature).state,'invalid_receipt');
  assert.equal(inspectReceipt('{"jsonrpc":"2.0","result":null}',signature).state,'not_found');
});
test('outcome CLI runs from another cwd and exposes case-level results',async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../src/reproduce-outcomes.mjs',import.meta.url))],{cwd:'/tmp',timeout:10000});
  const report=JSON.parse(stdout);
  assert.equal(report.passed,true);assert.equal(report.cases.length,7);
  assert.match(report.provenance,/synthetic/);
});
