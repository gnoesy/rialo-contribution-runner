import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {advanceAgenda,fetchAgenda,scheduleSummary,runScheduleCli,AGENDA_URL} from '../src/agp-schedule.mjs';
const before=JSON.parse(await readFile(new URL('./fixtures/agp-before.json',import.meta.url),'utf8'));
const after=JSON.parse(await readFile(new URL('./fixtures/agp-after.json',import.meta.url),'utf8'));
const snapshot=agenda=>({state:'verified_public_api',agenda});
test('fixture comparison distinguishes added, removed and changed fields by stable agenda ID',()=>{
  const {comparison:r}=advanceAgenda(before,after);
  assert.equal(r.state,'changed');assert.deepEqual(r.added.map(x=>x.id),['synthetic-c']);
  assert.deepEqual(r.removed.map(x=>x.id),['synthetic-b']);
  assert.deepEqual(r.changed.map(x=>({id:x.id,fields:x.fields})),[{id:'synthetic-a',fields:['raceAt','status']}]);
  assert.deepEqual(scheduleSummary(r),{state:'changed',comparable:true,addedCount:1,removedCount:1,changedCount:1});
});
test('empty successful response removes entries, but failed lookup preserves last good baseline',()=>{
  const empty=advanceAgenda(before,snapshot([]));assert.equal(empty.comparison.removed.length,2);
  const failed=advanceAgenda(before,{state:'unverified',agenda:[]});
  assert.equal(failed.baseline,before);assert.equal(failed.comparison.comparable,false);
  assert.equal(failed.comparison.removed,null);assert.equal(scheduleSummary(failed.comparison).removedCount,null);
});
test('invalid rows, missing or duplicate IDs block the entire comparison and preserve baseline',()=>{
  for(const agenda of [{},[null],[[]],[{id:''}],[{id:7}],[{id:' x'}],[{}],[{id:'a'},{id:'a'}]]){
    const r=advanceAgenda(before,snapshot(agenda));
    assert.equal(r.comparison.state,'invalid_schema');assert.equal(r.baseline,before);
    assert.equal(r.comparison.added,null);
  }
});
test('reordering rows/keys is unchanged; missing fields versus null and nested changes are detected',()=>{
  const b=snapshot([{id:'b',nested:{x:1,y:2}},{id:'a',status:null}]);
  const a=snapshot([{status:null,id:'a'},{nested:{y:2,x:1},id:'b'}]);
  assert.equal(advanceAgenda(b,a).comparison.state,'unchanged');
  delete a.agenda[0].status;a.agenda[1].nested.x=3;
  assert.deepEqual(advanceAgenda(b,a).comparison.changed.map(x=>x.fields),[['status'],['nested']]);
});
test('initial observation does not invent new events; recovery from unknown baseline starts a new baseline',()=>{
  const first=advanceAgenda(null,before);assert.equal(first.comparison.state,'initialized');assert.equal(first.comparison.added.length,0);
  const recovered=advanceAgenda({state:'unverified'},after);
  assert.equal(recovered.comparison.state,'baseline_unverified');assert.equal(recovered.baseline.agenda,after.agenda);
});
test('failure then recovery compares to retained last success and repeated snapshot has no duplicate diff',()=>{
  const failed=advanceAgenda(before,{state:'unverified'});
  const recovered=advanceAgenda(failed.baseline,after);
  assert.equal(recovered.comparison.state,'changed');
  assert.equal(advanceAgenda(recovered.baseline,after).comparison.state,'unchanged');
});
test('older observation cannot roll back the last successful baseline',()=>{
  const r=advanceAgenda(after,before);
  assert.equal(r.comparison.state,'stale_observation');assert.equal(r.baseline,after);
  assert.equal(r.comparison.added,null);
});
test('fetcher only reads fixed public agenda URL; HTTP/parser failures are unknown, not empty',async()=>{
  const good=await fetchAgenda({reader:async url=>{assert.equal(url,AGENDA_URL);return [];}});
  assert.equal(good.state,'verified_public_api');assert.deepEqual(good.agenda,[]);
  for(const reader of [async()=>{throw Error('HTTP 503');},async()=>({error:'unavailable'}),async()=>[{id:'x'},{id:'x'}]]){
    const bad=await fetchAgenda({reader});assert.equal(bad.state,'unverified');assert.equal(bad.agenda,undefined);
  }
});
test('CLI works offline outside cwd and failed live reads return nonzero without fictional removals',async()=>{
  const script=fileURLToPath(new URL('../src/agp-schedule.mjs',import.meta.url));
  const b=fileURLToPath(new URL('./fixtures/agp-before.json',import.meta.url));
  const a=fileURLToPath(new URL('./fixtures/agp-after.json',import.meta.url));
  const r=JSON.parse(execFileSync(process.execPath,[script,'--before',b,'--after',a],{cwd:'/tmp',encoding:'utf8'}));
  assert.equal(r.state,'changed');assert.equal(r.inputMode,'supplied_snapshots');
  let output='';const code=await runScheduleCli(['--before',b,'--live'],{fetcher:async()=>({state:'unverified'}),write:x=>{output+=x;}});
  assert.equal(code,1);assert.equal(JSON.parse(output).removed,null);
  assert.equal(await runScheduleCli(['--before',b,'--live','--rpc','https://example.com'],{write:()=>{}}),2);
});
