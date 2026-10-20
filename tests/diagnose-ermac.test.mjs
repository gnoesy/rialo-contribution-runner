import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {diagnoseErmac,collectErmac,runDiagnosticCli} from '../src/diagnose-ermac.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/ermac-ready-synthetic.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(fixture);
const states=r=>Object.fromEntries(r.checks.map(c=>[c.id,c.state]));
test('synthetic complete prerequisites pass; every independently missing field blocks readiness',()=>{
  assert.equal(diagnoseErmac(fixture).ready,true);
  assert.equal(diagnoseErmac(fixture).checks.length,8);
  for(const key of Object.keys(fixture.network.programs)){
    const s=copy();delete s.network.programs[key];assert.equal(diagnoseErmac(s).ready,false);
  }
  assert.equal(diagnoseErmac({}).ready,false);
});
test('missing, unknown, non-executable and executable-metadata errors stay distinct for all three programs',()=>{
  for(const key of ['medianAggregatorId','registryProgramId','subscriberProgramId']){
    for(const [patch,expected] of [[{state:'absent'},'missing'],[{state:'unverified'},'unknown'],[{executable:false},'not_executable'],[{executable:null},'unknown'],[{address:'wrong'},'address_mismatch']]){
      const s=copy();Object.assign(s.network.programs[key],patch);
      const r=diagnoseErmac(s);assert.equal(states(r)[key],expected);assert.equal(r.ready,false);
    }
  }
});
test('registry absence or unverified lookup never becomes a wrong-owner claim',()=>{
  for(const [state,expected] of [['absent','missing'],['unverified','unknown']]){
    const s=copy();s.network.programs.globalIndex.state=state;
    const r=diagnoseErmac(s);assert.equal(states(r).globalRegistry,expected);
    assert.equal(states(r).globalRegistryOwner,'unknown');assert.equal(r.ready,false);
  }
  const s=copy();s.network.programs.globalIndex.owner='different-owner';
  assert.equal(states(diagnoseErmac(s)).globalRegistryOwner,'wrong_owner');
  delete s.network.programs.globalIndex.owner;
  assert.equal(states(diagnoseErmac(s)).globalRegistryOwner,'unknown');
});
test('wrong target, unhealthy RPC, protocol drift and unknown protocol independently block readiness',()=>{
  for(const [mutate,key,state] of [
    [s=>s.network.url='https://example.com','rpc','address_mismatch'],
    [s=>s.network.health='not ok','health','unhealthy'],
    [s=>delete s.network.health,'health','unknown'],
    [s=>s.bundle.sha256='changed','protocol','mismatch'],
    [s=>s.bundle.matchesPinned=false,'protocol','mismatch'],
    [s=>s.bundle.url='https://example.com','protocol','mismatch'],
    [s=>s.bundle.state='unverified','protocol','unknown'],
  ]){
    const s=copy();mutate(s);const r=diagnoseErmac(s);
    assert.equal(states(r)[key],state);assert.equal(r.ready,false);
  }
});
test('collector rejects arbitrary endpoints before reads; network failures stay unknown while app is inspected',async()=>{
  let calls=0;
  const readers={networkReader:async()=>{calls++;throw Error('offline');},textReader:async()=>{calls++;throw Error('offline');}};
  await assert.rejects(collectErmac('https://example.com',readers),/allowlisted/);
  assert.equal(calls,0);
  const snapshot=await collectErmac(fixture.network.url,readers),r=diagnoseErmac(snapshot);
  assert.equal(snapshot.network.url,fixture.network.url);
  assert.equal(states(r).medianAggregatorId,'unknown');assert.equal(states(r).protocol,'unknown');
  assert.equal(r.checks.some(c=>c.state==='missing'),false);
});
test('collector detects public protocol mismatch without trusting a stale flag',async()=>{
  const snapshot=await collectErmac(fixture.network.url,{
    networkReader:async()=>fixture.network,
    textReader:async()=> 'changed public asset',
  });
  assert.equal(snapshot.bundle.matchesPinned,false);
  assert.equal(states(diagnoseErmac(snapshot)).protocol,'mismatch');
});
test('CLI read-only live reports block with exit 1 and rejects additional options before collection',async()=>{
  let out='';const s=copy();s.network.programs.medianAggregatorId.state='absent';
  assert.equal(await runDiagnosticCli(['--rpc',fixture.network.url],{collect:async()=>s,write:x=>{out+=x;}}),1);
  assert.equal(JSON.parse(out).inputMode,'live_read');
  for(const args of [[],['--rpc','https://example.com'],['--snapshot','x','--rpc',fixture.network.url],['--wallet','x']])
    assert.equal(await runDiagnosticCli(args,{collect:async()=>assert.fail('Unexpected read'),write:()=>{}}),2);
});
test('offline snapshot CLI runs from another cwd with explicit synthetic provenance and no live collector',()=>{
  const script=fileURLToPath(new URL('../src/diagnose-ermac.mjs',import.meta.url));
  const input=fileURLToPath(new URL('./fixtures/ermac-ready-synthetic.json',import.meta.url));
  const report=JSON.parse(execFileSync(process.execPath,[script,'--snapshot',input],{cwd:'/tmp',encoding:'utf8'}));
  assert.equal(report.ready,true);assert.equal(report.inputMode,'supplied_snapshot');
  assert.equal(report.readOnly,true);assert.equal(report.observedAt,null);
  assert.match(report.provenance,/Synthetic/);
});
