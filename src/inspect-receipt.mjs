import {pathToFileURL} from 'node:url';
import {Signature} from '@rialo/ts-cdk';
import {DEVNET_URLS} from './core.mjs';
import {inspectReceipt} from './receipt.mjs';

export const MAX_RECEIPT_BYTES=2_000_000;
const HELP=`Read one existing Rialo Devnet receipt. No wallet, signing or retries.
Usage: node src/inspect-receipt.mjs --rpc <URL> --signature <SIGNATURE>
Allowed URLs: ${DEVNET_URLS.join(', ')}
Exit codes: 0 execution_succeeded; 1 unsuccessful/unavailable read; 2 invalid arguments.
Execution success describes the returned receipt, not finality or reward eligibility.
`;

function validate(rpc,signature){
  if(!DEVNET_URLS.includes(rpc))throw Error('Use an exact allowlisted Devnet RPC URL');
  if(typeof signature!=='string'||!signature.length)throw Error('A transaction signature is required');
  try{Signature.fromString(signature);}catch{throw Error('Invalid transaction signature');}
}
export function parseArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  const values={};
  for(let i=0;i<args.length;i+=2){
    const name=args[i];
    if(!['--rpc','--signature'].includes(name)||Object.hasOwn(values,name)||!args[i+1]||args[i+1].startsWith('--'))
      throw Error('Provide --rpc and --signature exactly once; no other options');
    values[name]=args[i+1];
  }
  const result={rpc:values['--rpc'],signature:values['--signature']};
  validate(result.rpc,result.signature);
  return result;
}
async function boundedText(response){
  if(!response.body)return '';
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>MAX_RECEIPT_BYTES){await reader.cancel();throw Error('response_too_large');}
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
// Dependency injection is for offline tests, never a CLI endpoint override.
export async function queryReceipt({rpc,signature},{fetchImpl=globalThis.fetch}={}){
  validate(rpc,signature); // Reject before any network access.
  const base={schemaVersion:1,checkedAt:new Date().toISOString(),rpc,signature,readOnly:true};
  let response;
  try{
    response=await fetchImpl(rpc,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[{signature}]}),
      signal:AbortSignal.timeout(15000),redirect:'error',
    });
  }catch{
    return {...base,state:'transport_error',httpStatus:null,receipt:null,reason:'Request failed, timed out or redirected; transaction state is unknown'};
  }
  let text;
  try{text=await boundedText(response);}
  catch(error){
    return {...base,state:error.message==='response_too_large'?'response_too_large':'transport_error',httpStatus:response.status,receipt:null,reason:'Receipt body could not be read within the response limit'};
  }
  const outcome=inspectReceipt(text,signature);
  // A non-2xx response can explain a query failure, never attest execution.
  if(!response.ok&&outcome.state!=='rpc_error')
    return {...base,state:'http_error',httpStatus:response.status,receipt:null,reason:'Non-success HTTP response; transaction state is unknown'};
  const result={...base,httpStatus:response.status,...outcome};
  if(outcome.state==='rpc_error'){
    const error=JSON.parse(text).error;
    result.rpcError={
      code:Number.isSafeInteger(error?.code)?error.code:null,
      message:typeof error?.message==='string'?error.message.slice(0,500):null,
    };
  }
  return result;
}
export async function runCli(args,{write=s=>process.stdout.write(s),fetchImpl=globalThis.fetch}={}){
  let options;
  try{options=parseArguments(args);}
  catch(error){write(JSON.stringify({state:'usage_error',reason:error.message})+'\n');return 2;}
  if(options.help){write(HELP);return 0;}
  const result=await queryReceipt(options,{fetchImpl});
  write(JSON.stringify(result,null,2)+'\n');
  return result.state==='execution_succeeded'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.exitCode=await runCli(process.argv.slice(2));
