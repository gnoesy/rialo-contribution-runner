import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {DEVNET_URLS,PROGRAMS,globalIndex,inspectNetwork,getText,sha256} from './core.mjs';
import {BUNDLE_URL,BUNDLE_SHA256} from './ermac.mjs';

// Diagnostics only. No wallet/config/ledger is read and no creation is invoked.
function presence(entry,address){
  if(!entry||entry.state==='unverified')return ['unknown','Account lookup unavailable; absence is not established'];
  if(entry.address!==address)return ['address_mismatch','Observation is for a different address'];
  if(entry.state==='absent')return ['missing','RPC reported this account does not exist'];
  if(entry.state!=='present')return ['unknown','Unrecognized account observation'];
  return ['pass','Expected account is present'];
}
export function diagnoseErmac(snapshot){
  const network=snapshot?.network??{},bundle=snapshot?.bundle??{},checks=[];
  const add=(id,state,detail,extra={})=>checks.push({id,state,detail,...extra});
  add('rpc',DEVNET_URLS.includes(network.url)?'pass':'address_mismatch','Only the explicit Devnet RPC allowlist is supported',{observed:network.url??null});
  add('health',network.health==='ok'?'pass':network.health==null?'unknown':'unhealthy',
    network.health==='ok'?'RPC reports healthy':'RPC health is not confirmed');
  const verified=bundle.state==='verified_public_asset';
  const protocolState=!verified?'unknown':
    bundle.url!==BUNDLE_URL||bundle.sha256!==BUNDLE_SHA256||bundle.matchesPinned!==true?'mismatch':'pass';
  add('protocol',protocolState,protocolState==='pass'?'Public helper hash and app entrypoint match the pinned protocol':
    protocolState==='unknown'?'Public app protocol could not be verified':'Public app protocol differs from the pinned version; review required',
    {expectedSha256:BUNDLE_SHA256,observedSha256:bundle.sha256??null});
  for(const [id,address] of Object.entries(PROGRAMS)){
    const entry=network.programs?.[id];let [state,detail]=presence(entry,address);
    if(state==='pass'){
      state=entry.executable===true?'pass':entry.executable===false?'not_executable':'unknown';
      detail=state==='pass'?'Program is executable':state==='not_executable'?'Account exists but is not executable':'Executable flag is unavailable';
    }
    add(id,state,detail,{address});
  }
  const registry=network.programs?.globalIndex,address=globalIndex();
  const [state,detail]=presence(registry,address);
  add('globalRegistry',state,detail,{address});
  const ownerState=state!=='pass'||typeof registry.owner!=='string'?'unknown':
    registry.owner===PROGRAMS.registryProgramId?'pass':'wrong_owner';
  add('globalRegistryOwner',ownerState,ownerState==='pass'?'Global registry belongs to the registry program':
    ownerState==='wrong_owner'?'Global registry belongs to a different program':'Registry ownership cannot be established',
    {expectedOwner:PROGRAMS.registryProgramId,observedOwner:state==='pass'?registry.owner??null:null});
  return {
    schemaVersion:1,readOnly:true,observedAt:snapshot?.checkedAt??null,
    provenance:typeof snapshot?.provenance==='string'?snapshot.provenance.slice(0,500):null,
    ready:checks.every(c=>c.state==='pass'),checks,blockers:checks.filter(c=>c.state!=='pass').map(c=>c.id),
    limitations:'Read-only prerequisites, not feed execution, authorization, contribution acceptance or reward eligibility. Snapshot input is caller-supplied historical evidence.',
  };
}
export async function collectErmac(rpc,{networkReader=inspectNetwork,textReader=getText}={}){
  if(!DEVNET_URLS.includes(rpc))throw Error('Use an exact allowlisted Devnet RPC URL');
  const [network,bundle]=await Promise.all([
    Promise.resolve().then(()=>networkReader(rpc)).catch(()=>({url:rpc,state:'unverified'})),
    (async()=>{
      try{
        const [html,text]=await Promise.all([textReader('https://ermac.rialo.io/'),textReader(BUNDLE_URL)]);
        const hash=sha256(text);
        return {state:'verified_public_asset',url:BUNDLE_URL,sha256:hash,matchesPinned:hash===BUNDLE_SHA256&&html.includes('index-CTVFL0wM.js')};
      }catch{return {state:'unverified',url:BUNDLE_URL};}
    })(),
  ]);
  return {checkedAt:new Date().toISOString(),network,bundle};
}
export async function runDiagnosticCli(args,{write=s=>process.stdout.write(s),collect=collectErmac}={}){
  if(args.length===1&&args[0]==='--help'){
    write('Usage: node src/diagnose-ermac.mjs --rpc <allowlisted Devnet URL> OR --snapshot <JSON file>\nRead-only; no signing or creation. Exit 0: prerequisites pass; 1: blocked/unknown; 2: invalid input.\n');
    return 0;
  }
  if(args.length!==2||!['--rpc','--snapshot'].includes(args[0])||!args[1]){
    write(JSON.stringify({state:'usage_error',reason:'Choose exactly one --rpc or --snapshot input'})+'\n');return 2;
  }
  let snapshot;
  try{
    if(args[0]==='--rpc'){
      if(!DEVNET_URLS.includes(args[1]))throw Error('Use an exact allowlisted Devnet RPC URL');
      snapshot=await collect(args[1]);
    }else{
      snapshot=JSON.parse(await readFile(args[1],'utf8'));
      if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||!snapshot.network||!snapshot.bundle)
        throw Error('Snapshot must contain network and bundle observations');
    }
  }catch{write(JSON.stringify({state:'input_error',reason:'Invalid or unreadable input; use --help'})+'\n');return 2;}
  const report={inputMode:args[0]==='--rpc'?'live_read':'supplied_snapshot',...diagnoseErmac(snapshot)};
  write(JSON.stringify(report,null,2)+'\n');
  return report.ready?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.exitCode=await runDiagnosticCli(process.argv.slice(2));
