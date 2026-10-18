import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readdir,unlink,appendFile} from 'node:fs/promises';
import {load,save,json,lock,inspectNetwork,getJson,getText,sha256,actionFingerprint,SDK_VERSION,DEVNET_URLS} from './core.mjs';
import {runCanary} from './transactions.mjs';
import {maybeCreateFeed,BUNDLE_URL,BUNDLE_SHA256} from './ermac.mjs';
import {getReceipt} from './receipt.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.env.RIALO_RUNTIME_DIR?path.resolve(process.env.RIALO_RUNTIME_DIR):path.join(root,'runtime');
const publicOnly=process.argv.includes('--public');
const conf=publicOnly?null:await load(path.join(root,'config.local.json'),null);
const unlock=await lock(runtime);
async function checked(fn){try{return await fn();}catch(e){return {state:'unverified',error:e.message};}}
try{
  const now=new Date().toISOString();
  const results=await Promise.allSettled([
    inspectNetwork('https://devnet.rialo.io:4101'),inspectNetwork('https://devnet.rialo.io'),inspectNetwork('https://testnet.rialo.io:4101'),
    checked(async()=>{const [agenda,stats]=await Promise.all([getJson('https://api.agp.onlatch.com/track/schedule/agenda'),getJson('https://api.agp.onlatch.com/track/stats')]);if(!Array.isArray(agenda))throw Error('AGP agenda schema changed');return {state:'verified_public_api',agenda,stats};}),
    checked(async()=>{const m=await getJson('https://registry.npmjs.org/@rialo%2Fts-cdk');return {state:'verified_registry',installed:SDK_VERSION,latest:m['dist-tags']?.latest,publishedAt:m.time?.[m['dist-tags']?.latest]};}),
    checked(async()=>{const [html,bundle]=await Promise.all([getText('https://ermac.rialo.io/'),getText(BUNDLE_URL)]);const h=sha256(bundle);return {state:'verified_public_asset',url:BUNDLE_URL,sha256:h,matchesPinned:h===BUNDLE_SHA256&&html.includes('index-CTVFL0wM.js')};}),
  ]);
  const values=results.map(r=>r.status==='fulfilled'?r.value:{state:'unverified',error:r.reason?.message??'Unknown error'});
  const s={schemaVersion:1,checkedAt:now,sdkVersion:SDK_VERSION,networks:values.slice(0,3),agp:values[3],sdk:values[4],ermacBundle:values[5],
    rewardStatus:'unverified: test tokens and SDK checks are not Rialo Points or an airdrop entitlement',
    xCoverage:'Daily Codex heartbeat verifies public X pages; this worker does not infer no changes from unavailable X data.'};
  if(conf){
    const reachable=s.networks.find(n=>n.url===conf.rpcUrl&&n.health==='ok')??s.networks.find(n=>DEVNET_URLS.includes(n.url)&&n.health==='ok');
    const effective=reachable?{...conf,rpcUrl:reachable.url}:conf;
    if(process.argv.includes('--canary'))s.canary=await checked(()=>runCanary(effective,runtime));
    const ledger=await load(runtime+'/ledger.json');
    s.canary??=ledger.canary??{state:'not_attempted'};
    if(ledger.canary?.signature)s.canaryReceipt=await checked(()=>getReceipt(effective.rpcUrl,ledger.canary.signature));
    // A public-only worker cannot open a wallet, even if a local config is present.
    s.participation=await checked(()=>maybeCreateFeed(effective,runtime,reachable,s.ermacBundle.matchesPinned===true));
  }else s.participation={state:'public_read_only'};
  s.fingerprint=actionFingerprint(s);
  const prior=await load(runtime+'/latest.json');
  if(s.fingerprint!==prior.fingerprint)await appendFile(runtime+'/changes.jsonl',JSON.stringify({at:now,fingerprint:s.fingerprint,agp:s.agp,participation:s.participation})+'\n',{mode:0o600});
  await save(runtime+'/latest.json',s);
  const dir=runtime+'/snapshots';await save(dir+'/'+now.replace(/[:.]/g,'-')+'.json',s);
  const files=(await readdir(dir)).filter(x=>x.endsWith('.json')).sort();for(const f of files.slice(0,-192))await unlink(dir+'/'+f);
  console.log(json({checkedAt:now,networks:s.networks.map(n=>({url:n.url,health:n.health,error:n.error})),agpCount:s.agp.agenda?.length,canary:s.canary,participation:s.participation,changed:s.fingerprint!==prior.fingerprint}));
}finally{await unlock();}
