// Run from a clean checkout. Network isolation is enforced by the CI namespace,
// not by this script; local execution uses only recorded/synthetic inputs.
import {existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(Number(process.versions.node.split('.')[0]),22,'CI contract requires Node 22');
for(const file of ['config.local.json','runtime/ledger.json'])
  assert.equal(existsSync(file),false,`Run from a clean checkout without ${file}`);
function run(args){
  const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  if(result.error)throw result.error;
  if(result.status!==0){
    process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
    throw Error(`Offline command failed: ${args.join(' ')} (exit ${result.status})`);
  }
  return result.stdout;
}
const testFiles=readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
assert.ok(testFiles.length>0,'No test files found');
const tap=run(['--test','--test-reporter=tap',...testFiles]);
process.stdout.write(tap);
const passed=Number(tap.match(/^# pass (\d+)$/m)?.[1]);
assert.ok(passed>0);assert.match(tap,/^# fail 0$/m);
const checks=[
  {name:'receipt reproduction',args:['src/reproduce-receipt.mjs'],verify:r=>assert.equal(r.passed,true)},
  {name:'receipt outcomes',args:['src/reproduce-outcomes.mjs'],verify:r=>assert.equal(r.passed,true)},
  {name:'ERMAC wire fixture',args:['src/verify-ermac-wire.mjs'],verify:r=>assert.equal(r.passed,true)},
  {name:'ERMAC synthetic readiness',args:['src/diagnose-ermac.mjs','--snapshot','tests/fixtures/ermac-ready-synthetic.json'],verify:r=>{assert.equal(r.ready,true);assert.equal(r.inputMode,'supplied_snapshot');}},
  {name:'AGP synthetic diff',args:['src/agp-schedule.mjs','--before','tests/fixtures/agp-before.json','--after','tests/fixtures/agp-after.json'],verify:r=>{assert.equal(r.state,'changed');assert.equal(r.added.length,1);assert.equal(r.removed.length,1);assert.equal(r.changed.length,1);}},
];
for(const check of checks){check.verify(JSON.parse(run(check.args)));console.log(`Offline CLI passed: ${check.name}`);}
console.log(JSON.stringify({passed:true,node:process.versions.node,testsPassed:passed,cliChecksPassed:checks.length,liveRpc:false,walletLoaded:false}));
