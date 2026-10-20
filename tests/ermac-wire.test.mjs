import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildFeed} from '../src/ermac.mjs';
import {verifyWire,runWireCli} from '../src/verify-ermac-wire.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/ermac-wire.json',import.meta.url),'utf8'));
const tx=()=>buildFeed(fixture.creator,123n,{validFrom:BigInt(fixture.validFrom)});
function mutableTransaction(){
  const t=tx(),m=t.getMessage();
  const copy={...m,header:{...m.header},instructions:m.instructions.map(i=>({...i,accountKeyIndexes:[...i.accountKeyIndexes],data:Buffer.from(i.data)}))};
  return {getMessage:()=>copy,getSigners:()=>t.getSigners()};
}
test('fixed unsigned instructions match independent Python byte fixture and reviewed account layout',()=>{
  const r=verifyWire(fixture);assert.equal(r.passed,true);
  assert.deepEqual(r.instructions.map(i=>i.bytes),[36,243]);
  assert.equal(r.protocol.bundleFileVerified,false);
  assert.deepEqual(Buffer.from(tx().serialize()),Buffer.from(tx().serialize()));
});
test('changed protocol hash or supplied bundle fails before any comparison',()=>{
  const f=structuredClone(fixture);f.provenance.sha256='0'.repeat(64);
  assert.throws(()=>verifyWire(f),/provenance mismatch/);
  assert.throws(()=>verifyWire(fixture,{bundleBytes:Buffer.from('changed bundle')}),/hash changed/);
});
test('strict u64 inputs reject coercion, overflow and invalid creator; boundaries serialize',()=>{
  for(const v of [0n,-1n,2n**64n,123,'123',null,NaN])
    assert.throws(()=>buildFeed(fixture.creator,v),/positive u64/);
  for(const v of [0n,-1n,2n**64n,123,'123',null])
    assert.throws(()=>buildFeed(fixture.creator,123n,{validFrom:v}),/validFrom/);
  assert.throws(()=>buildFeed('invalid-key',123n));
  assert.doesNotThrow(()=>buildFeed(fixture.creator,2n**64n-1n,{validFrom:1n}).serialize());
});
test('instruction byte mutation, truncation and extra data cannot pass',()=>{
  for(const change of [b=>{b[0]^=1;return b;},b=>b.subarray(0,b.length-1),b=>Buffer.concat([b,Buffer.from([0])])]){
    const t=mutableTransaction();t.getMessage().instructions[1].data=change(Buffer.from(t.getMessage().instructions[1].data));
    const r=verifyWire(fixture,{transaction:t});
    assert.equal(r.passed,false);assert.equal(r.checks.find(c=>c.id==='instruction1.bytes').passed,false);
  }
});
test('wrong program, account order and privileges fail independently of correct data',()=>{
  for(const change of [
    m=>{m.instructions[1].programIdIndex=m.instructions[0].programIdIndex;},
    m=>{const a=m.instructions[1].accountKeyIndexes;[a[1],a[2]]=[a[2],a[1]];},
    m=>{m.header.numReadonlyUnsignedAccounts--;},
  ]){
    const t=mutableTransaction();change(t.getMessage());assert.equal(verifyWire(fixture,{transaction:t}).passed,false);
  }
});
test('altered scalar fixture inputs are rejected and wrong golden bytes are reported',()=>{
  for(const key of ['configHash','validFrom']){
    const f=structuredClone(fixture);f[key]=' 123';assert.throws(()=>verifyWire(f),/Invalid/);
  }
  const f=structuredClone(fixture);f.instructions[0].dataHex='00';
  assert.equal(verifyWire(f).passed,false);
});
test('offline CLI is independent of cwd, rejects unknown options and makes no live claim',async()=>{
  const script=fileURLToPath(new URL('../src/verify-ermac-wire.mjs',import.meta.url));
  const r=JSON.parse(execFileSync(process.execPath,[script],{cwd:'/tmp',encoding:'utf8'}));
  assert.equal(r.passed,true);assert.equal(r.mode,'offline_unsigned');
  assert.match(r.limitations,/No network/);
  assert.equal(await runWireCli(['--rpc','https://example.com'],{write:()=>{}}),2);
});
