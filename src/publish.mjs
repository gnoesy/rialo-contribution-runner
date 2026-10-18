import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {load,save,lock} from './core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=root+'/runtime';
const exec=promisify(execFile);
const git=async(...args)=>(await exec('/usr/bin/git',args,{cwd:root,timeout:30000})).stdout.trim();
const conf=await load(root+'/config.local.json',{});
if(conf.publishRepository==='gnoesy/rialo-contribution-runner'){
  const release=await lock(runtime+'/publisher');
  try{
    const s=await load(runtime+'/latest.json'),old=await load(runtime+'/published.json');
    if(!s.checkedAt||Date.now()-Date.parse(s.checkedAt)>3600000)throw Error('Status is stale; refusing to publish');
    const remote=await git('remote','get-url','origin');
    if(!['https://github.com/gnoesy/rialo-contribution-runner.git','git@github.com:gnoesy/rialo-contribution-runner.git'].includes(remote))throw Error('Unexpected publication remote');
    if(s.fingerprint!==old.fingerprint||Date.now()-Date.parse(old.at??0)>86400000){
      // Explicit whitelist. Wallet paths, local config, private keys, arbitrary errors and signed wire bytes never leave this machine.
      const report={schemaVersion:1,checkedAt:s.checkedAt,networks:s.networks.map(n=>({url:n.url,health:n.health??'unverified',height:n.height,configHash:n.configHash,latencyMs:n.latencyMs,programs:n.programs})),
        agp:{state:s.agp.state,upcomingCount:s.agp.agenda?.length},sdk:s.sdk,ermacBundle:s.ermacBundle,
        canary:s.canary?{state:s.canary.state,signature:s.canary.signature,estimatedFeeKelvin:s.canary.estimatedFeeKelvin}:null,
        participation:{state:s.participation.state,signature:s.participation.signature},rewardStatus:s.rewardStatus};
      await save(root+'/reports/latest.json',report);
      await git('add','--','reports/latest.json');
      if(await git('diff','--cached','--name-only'))await git('commit','--only','-m','Update public Rialo readiness evidence','--','reports/latest.json');
      await git('push','origin','main');
      await save(runtime+'/published.json',{at:new Date().toISOString(),fingerprint:s.fingerprint});
      console.log('Public evidence synchronized');
    }else console.log('No material change; publication skipped');
  }finally{await release();}
}
