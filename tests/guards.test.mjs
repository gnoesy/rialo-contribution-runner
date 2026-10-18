import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import {Keypair,TransactionBuilder,createAccount,SYSTEM_PROGRAM_ID} from '@rialo/ts-cdk';
import {parseConfigHash,deploymentReady,account,PROGRAMS} from '../src/core.mjs';
import {assertWriteConfig,validateTransaction,sendOnce,confirmed} from '../src/transactions.mjs';
import {buildFeed,feedAddresses} from '../src/ermac.mjs';
const key=Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const cfg={network:'devnet',rpcUrl:'https://devnet.rialo.io:4101',publicKey:key.publicKey.toString(),keypairPath:'/not-used',faucetKelvin:100_000_000,maxFeeKelvin:1_000_000};
test('u64 config hash remains exact; missing, zero and RPC errors rejected',()=>{
  assert.equal(parseConfigHash('{"result":{"configHashPrefix":18446744073709551615}}'),18446744073709551615n);
  for(const s of ['{"result":{"configHashPrefix":0}}','{"result":{}}','{"error":{"configHashPrefix":123}}'])assert.throws(()=>parseConfigHash(s));
});
test('write allowlist rejects mainnet and budget increases',()=>{
  assertWriteConfig(cfg);
  for(const p of [{network:'mainnet'},{rpcUrl:'https://evil.example'},{faucetKelvin:1e9},{maxFeeKelvin:-1}])assert.throws(()=>assertWriteConfig({...cfg,...p}));
});
test('transport failures remain unknown, not absent accounts',async()=>{
  assert.equal((await account({getAccountInfo:async()=>{throw Error('Account does not exist: x');}},cfg.publicKey)).state,'absent');
  await assert.rejects(()=>account({getAccountInfo:async()=>{throw Error('timeout');}},cfg.publicKey),/timeout/);
});
test('ERMAC activation requires all programs executable and registry ownership',()=>{
  const n={health:'ok',programs:Object.fromEntries(Object.keys(PROGRAMS).map(k=>[k,{state:'present',executable:true}]))};
  assert.equal(deploymentReady(n),false);n.programs.globalIndex={state:'present',owner:PROGRAMS.registryProgramId};assert.equal(deploymentReady(n),true);
  n.programs.medianAggregatorId.state='unverified';assert.equal(deploymentReady(n),false);
});
test('feed has deterministic workflow, correct payer, signer and allowed programs',()=>{
  const a=feedAddresses(cfg.publicKey),b=feedAddresses(cfg.publicKey);assert.equal(a.workflow.toString(),b.workflow.toString());
  const tx=buildFeed(cfg.publicKey,123n);validateTransaction(tx,cfg,Object.values(PROGRAMS),[cfg.publicKey]);
  assert.throws(()=>validateTransaction(tx,cfg,[SYSTEM_PROGRAM_ID.toString()],[cfg.publicKey]),/program/);
  assert.throws(()=>validateTransaction(tx,cfg,Object.values(PROGRAMS),[]),/signer/);
});
test('ambiguous send is journaled and never submitted twice',async()=>{
  const dir=await mkdtemp(os.tmpdir()+'/rialo-test-'),ledger={};let sends=0;
  const c={getFeeForMessage:async()=>({value:5000n}),sendTransaction:async()=>{sends++;throw Error('connection lost');}};
  const tx=buildFeed(cfg.publicKey,123n);
  try{await sendOnce(c,cfg,ledger,dir+'/ledger.json','feed',tx,[key],Object.values(PROGRAMS),async()=>true);
    await sendOnce(c,cfg,ledger,dir+'/ledger.json','feed',tx,[key],Object.values(PROGRAMS),async()=>true);
    assert.equal(sends,1);assert.equal(ledger.feed.state,'failed_or_unknown');assert.ok(ledger.feed.signature);
  }finally{await rm(dir,{recursive:true});}
});
test('unknown fee cannot submit',async()=>{
  await assert.rejects(()=>sendOnce({getFeeForMessage:async()=>({})},cfg,{},'/unused','feed',buildFeed(cfg.publicKey,123n),[key],Object.values(PROGRAMS),async()=>true),/Fee unavailable/);
});
test('onchain error cannot count as confirmed',async()=>{
  const sig=key.sign(new Uint8Array([1]));
  await assert.rejects(()=>confirmed({getSignatureStatuses:async()=>[{executed:true,err:'failed'}]},sig.toString()),/Transaction failed/);
});
