import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {queryReceipt,runCli,MAX_RECEIPT_BYTES} from '../src/inspect-receipt.mjs';
const original=JSON.parse(await readFile(new URL('./fixtures/canary-rpc.json',import.meta.url),'utf8'));
const signature=original.result.transaction.signatures[0],rpc='https://devnet.rialo.io:4101';
const reply=(body,status=200)=>async()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status});

test('reject non-allowlisted URLs and invalid signatures before network access',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('Must not fetch');};
  for(const url of ['https://example.com','http://127.0.0.1','https://devnet.rialo.io/','https://devnet.rialo.io:4101@evil.test','https://devnet.rialo.io?rpc=other','https://testnet.rialo.io:4101']){
    await assert.rejects(queryReceipt({rpc:url,signature},{fetchImpl}),/allowlisted/);
  }
  for(const invalid of ['',null,'garbage','0'.repeat(88)])
    await assert.rejects(queryReceipt({rpc,signature:invalid},{fetchImpl}),/signature/);
  assert.equal(calls,0);
});
test('both allowed endpoints send only one bounded getTransaction request',async()=>{
  for(const endpoint of [rpc,'https://devnet.rialo.io']){
    let calls=0;
    const result=await queryReceipt({rpc:endpoint,signature},{fetchImpl:async(url,options)=>{
      calls++;assert.equal(url,endpoint);assert.equal(options.method,'POST');
      assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(options.body),{jsonrpc:'2.0',id:1,method:'getTransaction',params:[{signature}]});
      return new Response(JSON.stringify(original));
    }});
    assert.equal(calls,1);assert.equal(result.state,'execution_succeeded');
    assert.equal(result.receipt.feeKelvin,'0');assert.equal(result.readOnly,true);
  }
});
test('HTTP error cannot turn a success-shaped receipt into success',async()=>{
  for(const body of [original,'<html>Unavailable</html>',{result:null}]){
    const result=await queryReceipt({rpc,signature},{fetchImpl:reply(body,503)});
    assert.equal(result.state,'http_error');assert.equal(result.receipt,null);
  }
});
test('HTTP 404 RPC error preserves code without misclassifying transaction execution',async()=>{
  const result=await queryReceipt({rpc,signature},{fetchImpl:reply({jsonrpc:'2.0',id:1,error:{code:-32001,message:'Transaction not found',data:{private:'omit'}}},404)});
  assert.equal(result.state,'rpc_error');assert.equal(result.httpStatus,404);
  assert.deepEqual(result.rpcError,{code:-32001,message:'Transaction not found'});
  assert.equal(result.receipt,null);
});
test('successful HTTP still distinguishes failed execution, unavailable and malformed receipts',async()=>{
  const failed=structuredClone(original);failed.result.meta.err={InstructionError:[0,{Custom:1}]};
  for(const [body,state] of [[failed,'execution_failed'],[{result:null},'not_found'],['broken','invalid_receipt']]){
    const result=await queryReceipt({rpc,signature},{fetchImpl:reply(body)});
    assert.equal(result.state,state);
  }
});
test('transport errors and oversize bodies remain unknown with no retry',async()=>{
  let calls=0;
  const result=await queryReceipt({rpc,signature},{fetchImpl:async()=>{calls++;throw Error('sensitive upstream text');}});
  assert.equal(result.state,'transport_error');assert.equal(calls,1);
  assert.ok(!JSON.stringify(result).includes('sensitive'));
  const large=await queryReceipt({rpc,signature},{fetchImpl:reply('x'.repeat(MAX_RECEIPT_BYTES+1))});
  assert.equal(large.state,'response_too_large');assert.equal(large.receipt,null);
});
test('CLI returns zero only for successful execution; failures and bad args are nonzero',async()=>{
  const args=['--rpc',rpc,'--signature',signature];
  for(const [body,status,code] of [[original,200,0],[original,500,1],[{result:null},200,1],['bad',200,1]]){
    let out='';const exit=await runCli(args,{fetchImpl:reply(body,status),write:s=>{out+=s;}});
    assert.equal(exit,code);assert.ok(JSON.parse(out).state);
  }
  for(const invalid of [[],['--rpc',rpc],args.concat(['--rpc',rpc]),args.concat(['--wallet','secret']),['--help','extra']]){
    let out='';const exit=await runCli(invalid,{write:s=>{out+=s;},fetchImpl:async()=>assert.fail('Unexpected fetch')});
    assert.equal(exit,2);assert.equal(JSON.parse(out).state,'usage_error');
  }
});
test('standalone CLI help works outside repo and invalid URL exits 2 without network',()=>{
  const script=fileURLToPath(new URL('../src/inspect-receipt.mjs',import.meta.url));
  assert.match(execFileSync(process.execPath,[script,'--help'],{cwd:'/tmp',encoding:'utf8'}),/No wallet/);
  assert.throws(()=>execFileSync(process.execPath,[script,'--rpc','https://example.com','--signature',signature],{cwd:'/tmp',encoding:'utf8'}),error=>{
    assert.equal(error.status,2);assert.equal(JSON.parse(error.stdout).state,'usage_error');return true;
  });
});
