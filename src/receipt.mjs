// Compatibility adapter for ts-cdk 0.18.1 versus the 0.22.0-alpha.2 RPC response.
// Unlike the SDK's getTransactionDetails, accept camelCase as well as snake_case.
import {getText,DEVNET_URLS} from './core.mjs';
import {Signature} from '@rialo/ts-cdk';
// Keep integers as decimal strings after validation, never coerce null/booleans/
// objects or round a large JSON number. This is a representation check, not an
// assertion about a protocol's maximum integer width or transaction finality.
function decimalInteger(value,field){
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0))return String(value);
  if(typeof value==='string'&&value.trim()===value&&/^(0|[1-9][0-9]*)$/.test(value))return value;
  throw Error(`Invalid ${field}: expected a non-negative safe integer or canonical decimal string`);
}
function requiredInteger(object,names,field){
  const present=names.filter(name=>Object.hasOwn(object??{},name));
  if(!present.length)throw Error(`Missing ${field}`);
  const values=present.map(name=>decimalInteger(object[name],field));
  if(values.some(value=>value!==values[0]))throw Error(`Conflicting ${field} aliases`);
  return values[0];
}
export function parseReceipt(text,expectedSignature){
  const envelope=JSON.parse(text,(_,v)=>{if(typeof v==='number'&&!Number.isSafeInteger(v))throw Error('Unsafe numeric RPC field');return v;});
  if(envelope.error||!envelope.result)throw Error('Transaction receipt unavailable');
  const r=envelope.result,t=r.transaction,m=t?.message,h=m?.header;
  const keys=m?.accountKeys??m?.account_keys;
  if(!Array.isArray(keys)||!keys.length||!t?.signatures?.includes(expectedSignature))throw Error('Receipt identity or accounts invalid');
  const fee=requiredInteger(r.meta,['fee'],'fee');
  const block=requiredInteger(r,['block_height','blockHeight'],'blockHeight');
  const validFrom=requiredInteger(t,['validFrom','valid_from'],'validFrom');
  if(!h||!Array.isArray(m.instructions))throw Error('Incomplete transaction receipt');
  const programs=m.instructions.map(i=>{const n=i.programIdIndex??i.program_id_index;if(!Number.isInteger(n)||n<0||n>=keys.length)throw Error('Invalid program index');return keys[n];});
  const signers=h.numRequiredSignatures??h.num_required_signatures;
  if(!Number.isInteger(signers)||signers<1||signers>keys.length)throw Error('Invalid signer count');
  return {signature:expectedSignature,blockHeight:block,feeKelvin:fee,error:r.meta.err??null,
    accountKeys:keys,programs,signerCount:signers,validFrom,
    logs:r.meta.logMessages??r.meta.log_messages??[],rpcVersion:r.context?.api_version??null};
}
export async function getReceipt(url,signature){
  if(!DEVNET_URLS.includes(url))throw Error('Receipt endpoint not allowlisted');
  Signature.fromString(signature);
  return parseReceipt(await getText(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[{signature}]})}),signature);
}
