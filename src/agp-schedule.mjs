import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {getJson} from './core.mjs';
export const AGENDA_URL='https://api.agp.onlatch.com/track/schedule/agenda';

function index(snapshot){
  if(snapshot?.state!=='verified_public_api')throw Error('unverified');
  if(!Array.isArray(snapshot.agenda))throw Error('invalid_schema');
  const entries=new Map();
  for(const row of snapshot.agenda){
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim()||row.id!==row.id.trim()||entries.has(row.id))
      throw Error('invalid_schema');
    entries.set(row.id,row);
  }
  return entries;
}
export function advanceAgenda(previous,current){
  let after;
  try{after=index(current);}
  catch(error){return {comparison:{state:error.message,comparable:false,added:null,removed:null,changed:null},baseline:previous};}
  if(Number.isFinite(Date.parse(previous?.checkedAt))&&Number.isFinite(Date.parse(current.checkedAt))&&Date.parse(current.checkedAt)<Date.parse(previous.checkedAt))
    return {comparison:{state:'stale_observation',comparable:false,added:null,removed:null,changed:null},baseline:previous};
  const baseline={state:'verified_public_api',checkedAt:current.checkedAt??null,agenda:current.agenda};
  if(previous==null)return {comparison:{state:'initialized',comparable:false,added:[],removed:[],changed:[]},baseline};
  let before;
  try{before=index(previous);}
  catch{return {comparison:{state:'baseline_unverified',comparable:false,added:null,removed:null,changed:null},baseline};}
  const added=[],removed=[],changed=[];
  for(const id of [...after.keys()].sort()){
    if(!before.has(id))added.push(after.get(id));
    else if(!isDeepStrictEqual(before.get(id),after.get(id))){
      const a=before.get(id),b=after.get(id);
      const fields=[...new Set([...Object.keys(a),...Object.keys(b)])].sort()
        .filter(key=>Object.hasOwn(a,key)!==Object.hasOwn(b,key)||!isDeepStrictEqual(a[key],b[key]));
      changed.push({id,fields,before:a,after:b});
    }
  }
  for(const id of [...before.keys()].sort())if(!after.has(id))removed.push(before.get(id));
  return {comparison:{state:added.length||removed.length||changed.length?'changed':'unchanged',comparable:true,added,removed,changed},baseline};
}
export function scheduleSummary(comparison){
  return {state:comparison.state,comparable:comparison.comparable,
    addedCount:comparison.added?.length??null,removedCount:comparison.removed?.length??null,changedCount:comparison.changed?.length??null};
}
export async function fetchAgenda({reader=getJson}={}){
  const checkedAt=new Date().toISOString();
  try{
    const result={state:'verified_public_api',checkedAt,agenda:await reader(AGENDA_URL)};
    index(result);return result;
  }catch(error){return {state:'unverified',checkedAt,reason:error.message==='invalid_schema'?'invalid_schema':'fetch_failed'};}
}
export async function runScheduleCli(args,{write=s=>process.stdout.write(s),fetcher=fetchAgenda}={}){
  if(args.length===1&&args[0]==='--help'){
    write('Usage: node src/agp-schedule.mjs --before <snapshot.json> (--after <snapshot.json> | --live)\nRead-only public comparison; no registration, betting or baseline file writes.\nExit 0: verified initialization/comparison; 1: unknown/invalid observation; 2: invalid input.\n');return 0;
  }
  if(args[0]!=='--before'||!args[1]||!((args.length===3&&args[2]==='--live')||(args.length===4&&args[2]==='--after'&&args[3]))){
    write('{"state":"usage_error"}\n');return 2;
  }
  let before,after;
  try{
    before=JSON.parse(await readFile(args[1],'utf8'));
    after=args[2]==='--live'?await fetcher():JSON.parse(await readFile(args[3],'utf8'));
  }catch{write('{"state":"input_error","reason":"Cannot read snapshot JSON"}\n');return 2;}
  const {comparison}=advanceAgenda(before,after);
  write(JSON.stringify({schemaVersion:1,source:AGENDA_URL,inputMode:args[2]==='--live'?'public_live_read':'supplied_snapshots',
    beforeCheckedAt:before?.checkedAt??null,afterCheckedAt:after?.checkedAt??null,currentState:after?.state??null,
    currentCount:after?.state==='verified_public_api'&&Array.isArray(after.agenda)?after.agenda.length:null,
    ...comparison,
    limitation:'Removed means absent from this agenda response, not proven cancellation. Public agenda does not establish personalized eligibility, points or rewards.'},null,2)+'\n');
  return ['initialized','changed','unchanged'].includes(comparison.state)?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.exitCode=await runScheduleCli(process.argv.slice(2));
