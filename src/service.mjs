import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {save} from './core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function run(script,timeout){return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script],{cwd:root,stdio:'inherit'});
  const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
  child.once('error',e=>{clearTimeout(timer);reject(e);});
  child.once('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error(`${script} exited ${code??signal}`));});
});}
try{await run('src/runner.mjs',120000);await run('src/publish.mjs',90000);await save(root+'runtime/service.json',{checkedAt:new Date().toISOString(),state:'ok'});}
catch(e){await save(root+'runtime/service.json',{checkedAt:new Date().toISOString(),state:'error',error:e.message});console.error(e.message);process.exitCode=1;}
