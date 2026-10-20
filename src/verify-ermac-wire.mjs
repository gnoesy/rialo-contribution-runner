import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {buildFeed,feedAddresses,BUNDLE_URL,BUNDLE_SHA256} from './ermac.mjs';
import {sha256} from './core.mjs';

export function verifyWire(fixture,{bundleBytes,transaction}={}){
  if(fixture?.provenance?.url!==BUNDLE_URL||fixture.provenance.sha256!==BUNDLE_SHA256)
    throw Error('Fixture protocol provenance mismatch');
  if(bundleBytes!==undefined&&sha256(bundleBytes)!==BUNDLE_SHA256)
    throw Error('Public bundle hash changed; protocol review required');
  for(const key of ['configHash','validFrom'])
    if(typeof fixture[key]!=='string'||!/^(0|[1-9][0-9]*)$/.test(fixture[key]))throw Error(`Invalid ${key}`);
  const tx=transaction??buildFeed(fixture.creator,BigInt(fixture.configHash),{validFrom:BigInt(fixture.validFrom)});
  const m=tx.getMessage(),h=m.header;
  const checks=[],add=(id,actual,expected)=>checks.push({id,passed:isDeepStrictEqual(actual,expected)});
  add('payer',m.accountKeys[0].toString(),fixture.creator);
  add('configHash',String(m.configHashPrefix),fixture.configHash);
  add('validFrom',String(m.validFrom),fixture.validFrom);
  add('signers',tx.getSigners().map(k=>k.toString()),[fixture.creator]);
  const a=feedAddresses(fixture.creator);
  add('workflowSlug',a.slug.toString('hex'),fixture.slugHex);
  add('derivedAddresses',Object.fromEntries(Object.entries(a).filter(([k])=>k!=='slug').map(([k,v])=>[k,v.toString()])),fixture.addresses);
  add('instructionCount',m.instructions.length,fixture.instructions?.length);
  const instructions=m.instructions.map((ix,i)=>{
    const expected=fixture.instructions?.[i],data=Buffer.from(ix.data);
    const accounts=Array.from(ix.accountKeyIndexes,n=>({
      pubkey:m.accountKeys[n].toString(),
      isSigner:n<h.numRequiredSignatures,
      isWritable:n<h.numRequiredSignatures?n<h.numRequiredSignatures-h.numReadonlySignedAccounts:
        n<m.accountKeys.length-h.numReadonlyUnsignedAccounts,
    }));
    add(`instruction${i}.program`,m.accountKeys[ix.programIdIndex].toString(),expected?.programId);
    add(`instruction${i}.accountOrderAndPrivileges`,accounts,expected?.accounts);
    add(`instruction${i}.bytes`,data.toString('hex'),expected?.dataHex);
    return {index:i,bytes:data.length,sha256:sha256(data)};
  });
  return {
    schemaVersion:1,passed:checks.every(c=>c.passed),mode:'offline_unsigned',
    protocol:{url:BUNDLE_URL,sha256:BUNDLE_SHA256,bundleFileVerified:bundleBytes!==undefined},
    referenceMethod:fixture.provenance.method,checks,instructions,
    limitations:'Compares against a manually transcribed public app layout and fixed PDA fixture, not an independent official-app execution. No network, wallet, signing, submission, live feed success or reward claim.',
  };
}
export async function runWireCli(args,{write=s=>process.stdout.write(s)}={}){
  if(args.length===1&&args[0]==='--help'){
    write('Usage: node src/verify-ermac-wire.mjs [--bundle <previously downloaded public helper file>]\nOffline unsigned fixture comparison. Exit 0: matched; 1: mismatch; 2: invalid input.\n');return 0;
  }
  if(args.length!==0&&(args.length!==2||args[0]!=='--bundle'||!args[1])){
    write('{"state":"usage_error"}\n');return 2;
  }
  try{
    const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/ermac-wire.json',import.meta.url),'utf8'));
    const bundleBytes=args.length?await readFile(args[1]):undefined;
    const report=verifyWire(fixture,{bundleBytes});write(JSON.stringify(report,null,2)+'\n');return report.passed?0:1;
  }catch(error){write(JSON.stringify({state:'verification_error',reason:error.code==='ENOENT'?'Input file not found':error.message})+'\n');return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.exitCode=await runWireCli(process.argv.slice(2));
