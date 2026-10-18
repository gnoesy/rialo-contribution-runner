import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, open, unlink} from 'node:fs/promises';
import path from 'node:path';
import {createRialoClient,RIALO_DEVNET_CHAIN,RIALO_TESTNET_CHAIN,PublicKey} from '@rialo/ts-cdk';

export const SDK_VERSION='0.18.1';
export const PROGRAMS=Object.freeze({
  medianAggregatorId:'M4tvfJkVtzhBozkywmG45xfvBJhVqJghqSuxjEKY6Mx',
  registryProgramId:'3nmnQVAgKaBrWiauqdEwoSqa8rVACjEbZVcGH5VeVn62',
  subscriberProgramId:'95uDFDmcDHB32zpBzfaaXhmVNeJ5PAt2FaFw4nPknuho',
});
export const DEVNET_URLS=['https://devnet.rialo.io:4101','https://devnet.rialo.io'];
export const sha256=x=>createHash('sha256').update(x).digest('hex');
export const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
export async function save(file,value){await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await writeFile(tmp,json(value),{mode:0o600});await rename(tmp,file);}
export async function load(file,fallback={}){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function lock(dir){
  await mkdir(dir,{recursive:true});const file=path.join(dir,'runner.lock');
  try{const f=await open(file,'wx',0o600);await f.writeFile(String(process.pid));await f.close();}
  catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await readFile(file,'utf8'));if(!Number.isInteger(pid)||pid<=0)throw Error('Invalid lock; inspect manually');
    try{process.kill(pid,0);throw Error('Another runner is active');}catch(x){if(x.code!=='ESRCH')throw x;}
    await unlink(file);return lock(dir);
  }
  return ()=>unlink(file);
}
export async function getText(url,options={}){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!r.ok)throw Error(`HTTP ${r.status} at ${new URL(url).host}`);
  const s=await r.text();if(s.length>4_000_000)throw Error('Response too large');return s;
}
export async function getJson(url){return JSON.parse(await getText(url));}
export function parseConfigHash(text){
  // Do not round u64 through Number; do not accept a matching string in an RPC error.
  const quoted=text.replace(/("configHashPrefix"\s*:\s*)(\d+)/g,'$1"$2"');
  const r=JSON.parse(quoted);if(r.error)throw Error('RPC config query failed');
  const n=r.result?.configHashPrefix;
  if(typeof n!=='string'||!/^\d+$/.test(n)||BigInt(n)<=0n||BigInt(n)>2n**64n-1n)throw Error('Invalid config hash');
  return BigInt(n);
}
export async function configHash(url){return parseConfigHash(await getText(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getRecentValidatorConfigHash',params:[{}]})}));}
export function client(url){
  if(![...DEVNET_URLS,RIALO_TESTNET_CHAIN.rpcUrl].includes(url))throw Error('RPC endpoint not allowlisted');
  return createRialoClient({chain:{...(url.includes('testnet')?RIALO_TESTNET_CHAIN:RIALO_DEVNET_CHAIN),rpcUrl:url},transport:{timeout:15000,maxRetries:0}});
}
export async function account(c,key){try{return {state:'present',value:await c.getAccountInfo(PublicKey.fromString(key))};}catch(e){
  if(/^Account does not exist: /.test(e.message))return {state:'absent'};throw e;
}}
export function globalIndex(){return PublicKey.findProgramAddress([new TextEncoder().encode('ermac_global')],PublicKey.fromString(PROGRAMS.registryProgramId))[0].toString();}
export async function inspectNetwork(url){
  const c=client(url),start=Date.now();
  const [health,height,hash]=await Promise.all([c.getHealth(),c.getBlockHeight(),configHash(url)]);
  const entries=await Promise.all(Object.entries({...PROGRAMS,globalIndex:globalIndex()}).map(async([name,address])=>{
    try{const a=await account(c,address);return [name,{address,state:a.state,...(a.value?{executable:a.value.executable,owner:a.value.owner.toString(),space:String(a.value.space)}:{})}];}
    catch(e){return [name,{address,state:'unverified',error:e.message}];}
  }));
  return {url,health,height:String(height),configHash:String(hash),latencyMs:Date.now()-start,programs:Object.fromEntries(entries)};
}
export function deploymentReady(network){return network?.health==='ok'&&Object.keys(PROGRAMS).every(k=>network.programs?.[k]?.state==='present'&&network.programs[k].executable===true)&&network.programs?.globalIndex?.state==='present'&&network.programs.globalIndex.owner===PROGRAMS.registryProgramId;}
export function actionFingerprint(s){return sha256(JSON.stringify({networks:s.networks.map(n=>({url:n.url,error:n.error,health:n.health,programs:n.programs})),agenda:s.agp?.agenda,sdk:s.sdk?.latest,ermac:s.ermacBundle?.matchesPinned,write:s.participation,canary:s.canary}));}
