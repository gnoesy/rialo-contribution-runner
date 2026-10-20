// Wire format derived from the public ERMAC application. No app bundle is executed.
import {createHash} from 'node:crypto';
import {PublicKey,TransactionBuilder,SYSTEM_PROGRAM_ID} from '@rialo/ts-cdk';
import {PROGRAMS,account,client,configHash,load,save,deploymentReady,getJson} from './core.mjs';
import {wallet,ensureFunds,sendOnce,confirmed} from './transactions.mjs';
export const BUNDLE_URL='https://ermac.rialo.io/assets/frost-public-key-tgtsfZiz.js';
export const BUNDLE_SHA256='2e5fc8a9ab654d4ca2067c70d14789da15e17e7656984fa9ff5d9560396890ac';
export const FEED=Object.freeze({name:'GNOESY_USDC_USD_V1',url:'https://api.coinbase.com/v2/prices/USDC-USD/spot',interval:3600,labels:['USDC_USD'],patterns:['$.data.amount']});
const pk=s=>PublicKey.fromString(s),enc=s=>Buffer.from(s),hash=b=>createHash('sha256').update(b).digest();
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const str=s=>Buffer.concat([u64(Buffer.byteLength(s)),enc(s)]);
const vec=a=>Buffer.concat([u64(a.length),...a.map(str)]);
const pda=(program,seeds)=>PublicKey.findProgramAddress(seeds,pk(program))[0];
const system=SYSTEM_PROGRAM_ID.toString(),subscriber='Subscriber111111111111111111111111111111111',oracle='Qrac1eRegistry11111111111111111111111111111';
const meta=(pubkey,isSigner=false,isWritable=false)=>({pubkey:typeof pubkey==='string'?pk(pubkey):pubkey,isSigner,isWritable});
export function feedAddresses(creator){
  const slug=hash(enc(`rialo-contribution-runner:v1:${creator}:${FEED.name}`));
  const workflow=pda(PROGRAMS.subscriberProgramId,[enc('rialo_workflow'),pk(creator).toBytes(),slug]);
  const nonce=n=>hash(Buffer.concat([Buffer.from(workflow.toBytes()),u64(0),u64(n)]));
  return {slug,workflow,event:pda(PROGRAMS.subscriberProgramId,[enc('rialo_event'),hash(enc(FEED.name))]),
    creator:pda(PROGRAMS.registryProgramId,[enc('ermac_creator'),pk(creator).toBytes()]),
    global:pda(PROGRAMS.registryProgramId,[enc('ermac_global')]),
    subscription:pda(subscriber,[enc('rialo_subscribe'),pk(creator).toBytes(),nonce(5)]),
    rex:pda(oracle,[enc('rex_info'),pk(creator).toBytes(),nonce(6)])};
}
export function buildFeed(creator,config,{validFrom=BigInt(Date.now())}={}){
  if(typeof config!=='bigint'||config<=0n||config>2n**64n-1n)throw Error('Config hash must be a positive u64 bigint');
  if(typeof validFrom!=='bigint'||validFrom<=0n||validFrom>2n**64n-1n)throw Error('validFrom must be a positive u64 bigint');
  const a=feedAddresses(creator),t=TransactionBuilder.create().setPayer(pk(creator)).setValidFrom(validFrom).setConfigHashPrefix(config);
  t.addInstruction({programId:pk(PROGRAMS.registryProgramId),accounts:[meta(creator,true,true),meta(a.creator,false,true),meta(a.global,false,true),meta(system)],data:Buffer.concat([u32(1),Buffer.from(a.workflow.toBytes())])});
  t.addInstruction({programId:pk(PROGRAMS.subscriberProgramId),accounts:[meta(creator,true,true),meta(a.workflow,false,true),meta(oracle),meta(system),meta(subscriber),meta(a.subscription,false,true),meta(a.rex,false,true)],
    data:Buffer.concat([u32(4),a.slug,str(FEED.name),str(FEED.url),Buffer.from(pk(PROGRAMS.medianAggregatorId).toBytes()),Buffer.from(a.event.toBytes()),u64(FEED.interval),vec(FEED.labels),vec(FEED.patterns)])});
  return t.build();
}
export async function maybeCreateFeed(conf,runtime,network,bundleMatches){
  if(!conf.autoCreateFeed)return {state:'disabled'};
  if(!bundleMatches)return {state:'blocked_protocol_changed_or_unverified'};
  if(!deploymentReady(network))return {state:'blocked_programs_unavailable'};
  const file=runtime+'/ledger.json',ledger=await load(file),c=client(conf.rpcUrl),a=feedAddresses(conf.publicKey);
  if(ledger.feed){
    if(ledger.feed.state!=='verified'&&await confirmed(c,ledger.feed.signature)&&(await account(c,a.workflow.toString())).state==='present'){ledger.feed.state='verified';await save(file,ledger);}
    return {...ledger.feed,workflow:a.workflow.toString(),event:a.event.toString()};
  }
  if((await account(c,a.workflow.toString())).state==='present')return {state:'existing_workflow_no_new_submission',workflow:a.workflow.toString()};
  const source=await getJson(FEED.url);if(source.data?.base!=='USDC'||source.data?.currency!=='USD'||!Number.isFinite(Number(source.data?.amount)))throw Error('Unexpected feed source schema');
  const k=await wallet(conf);
  try{
    await ensureFunds(c,conf,ledger,file,10_000_000n);
    return await sendOnce(c,conf,ledger,file,'feed',buildFeed(conf.publicKey,await configHash(conf.rpcUrl)),[k],Object.values(PROGRAMS),async()=>{
      const x=await account(c,a.workflow.toString());return x.state==='present'&&x.value.owner.toString()===PROGRAMS.subscriberProgramId;
    });
  }finally{k.dispose();}
}
