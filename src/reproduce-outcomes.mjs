// Offline outcome matrix; no RPC, signing, wallet or local config.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {inspectReceipt} from './receipt.mjs';

export async function reproduceOutcomes(){
  const original=JSON.parse(await readFile(new URL('../tests/fixtures/canary-rpc.json',import.meta.url),'utf8'));
  const manifest=JSON.parse(await readFile(new URL('../tests/fixtures/receipt-cases.json',import.meta.url),'utf8'));
  const cases=manifest.cases.map(c=>{
    const response=Object.hasOwn(c,'response')?structuredClone(c.response):structuredClone(original);
    if(Object.hasOwn(c,'metaErr'))response.result.meta.err=c.metaErr;
    if(c.omitMetaErr)delete response.result.meta.err;
    const result=inspectReceipt(JSON.stringify(response),c.expectedSignature??original.result.transaction.signatures[0]);
    return {id:c.id,source:c.source,expected:c.expected,actual:result.state,passed:result.state===c.expected,
      executionError:result.receipt?.error??null};
  });
  return {schemaVersion:1,mode:'offline_outcome_fixtures',provenance:manifest.provenance,
    transactionsSubmitted:0,publicNetworkRequests:0,cases,passed:cases.every(c=>c.passed),
    limitation:'Synthetic failure cases test classification; not evidence of real failed transactions, finality or rewards.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await reproduceOutcomes();console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}
  catch(error){console.error(`Outcome reproduction failed: ${error.message}`);process.exitCode=1;}
}
