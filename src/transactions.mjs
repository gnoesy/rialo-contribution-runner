import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Keypair,PublicKey,Signature,TransactionBuilder,createAccount,SYSTEM_PROGRAM_ID} from '@rialo/ts-cdk';
import {DEVNET_URLS,client,configHash,account,save,load} from './core.mjs';

export function assertWriteConfig(c){
  if(c.network!=='devnet'||!DEVNET_URLS.includes(c.rpcUrl))throw Error('Signing is Devnet-only');
  if(!c.publicKey||!c.keypairPath)throw Error('Explicit wallet configuration required');
  if(!Number.isSafeInteger(c.faucetKelvin)||c.faucetKelvin<0||c.faucetKelvin>100_000_000)throw Error('Faucet limit exceeded');
  if(!Number.isSafeInteger(c.maxFeeKelvin)||c.maxFeeKelvin<0||c.maxFeeKelvin>1_000_000)throw Error('Fee limit exceeded');
}
export async function wallet(c){
  assertWriteConfig(c);if((await stat(c.keypairPath)).mode&0o077)throw Error('Wallet file permissions must be 0600');
  const a=JSON.parse(await readFile(c.keypairPath,'utf8'));
  if(!Array.isArray(a)||a.length!==64||a.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Expected Solana 64-byte key file');
  const bytes=Uint8Array.from(a);a.fill(0);const k=Keypair.fromSecretKey(bytes.slice(0,32));
  const valid=k.publicKey.toString()===c.publicKey&&Buffer.from(k.publicKey.toBytes()).equals(Buffer.from(bytes.slice(32)));bytes.fill(0);
  if(!valid){k.dispose();throw Error('Wallet public key does not match pinned identity');}return k;
}
export function validateTransaction(tx,c,allowedPrograms,expectedSigners){
  assertWriteConfig(c);const m=tx.getMessage();
  if(m.accountKeys[0].toString()!==c.publicKey)throw Error('Unexpected payer');
  if(m.configHashPrefix<=0n)throw Error('Missing replay protection');
  if(Math.abs(Number(m.validFrom)-Date.now())>60_000)throw Error('Stale transaction');
  if(tx.getSigners().map(x=>x.toString()).sort().join()!==[...expectedSigners].sort().join())throw Error('Unexpected signer');
  if(!m.instructions.length||m.instructions.some(i=>!allowedPrograms.includes(m.accountKeys[i.programIdIndex].toString())))throw Error('Unexpected program');
}
export async function confirmed(c,signature){
  const out=await c.getSignatureStatuses([Signature.fromString(signature).toBytes()]),s=out[0];
  if(s?.err)throw Error(`Transaction failed: ${s.err}`);
  return s?.executed===true;
}
export async function ensureFunds(c,conf,ledger,file,minimum){
  const pk=PublicKey.fromString(conf.publicKey),balance=await c.getBalance(pk);
  if(balance>=minimum)return;
  if(ledger.faucet)throw Error('Faucet already attempted; no automatic repeat');
  ledger.faucet={state:'intent_recorded',at:new Date().toISOString(),kelvin:conf.faucetKelvin};await save(file,ledger);
  try{const sig=await c.requestAirdrop(pk,BigInt(conf.faucetKelvin));ledger.faucet={...ledger.faucet,state:'submitted',signature:Signature.fromBytes(sig).toString()};await save(file,ledger);}
  catch(e){ledger.faucet.state='failed_or_unknown';ledger.faucet.error=e.message;await save(file,ledger);throw e;}
  for(let i=0;i<6;i++){if(await c.getBalance(pk)>=minimum)return;await new Promise(r=>setTimeout(r,1500));}
  throw Error('Faucet funds not observed; next run will recheck balance');
}
export async function sendOnce(c,conf,ledger,file,id,tx,keys,programs,postcondition){
  if(ledger[id])return ledger[id];
  validateTransaction(tx,conf,programs,keys.map(k=>k.publicKey.toString()));
  const fee=(await c.getFeeForMessage(Buffer.from(tx.getMessage().serialize()).toString('base64'))).value;
  if(fee===undefined||fee<0n||fee>BigInt(conf.maxFeeKelvin))throw Error('Fee unavailable or exceeds cap');
  const signed=tx.signAll(keys);signed.ensureSigned();const signature=Signature.fromBytes(signed.getSignature(0)).toString();
  // Persist before submission. A lost response never causes an automatic new transaction.
  ledger[id]={state:'signed_pending',signature,estimatedFeeKelvin:String(fee),at:new Date().toISOString()};await save(file,ledger);
  try{
    const sent=await c.sendTransaction(signed.serialize(),{skipPreflight:false,maxRetries:0});
    if(Signature.fromBytes(sent).toString()!==signature)throw Error('RPC returned a different signature');
    ledger[id].state='submitted';await save(file,ledger);
    for(let i=0;i<8;i++){
      if(await confirmed(c,signature)&&await postcondition()){ledger[id].state='verified';break;}
      await new Promise(r=>setTimeout(r,1500));
    }
  }catch(e){ledger[id].state='failed_or_unknown';ledger[id].error=e.message;}
  await save(file,ledger);return ledger[id];
}
export async function runCanary(conf,runtime){
  assertWriteConfig(conf);const file=runtime+'/ledger.json',ledger=await load(file),c=client(conf.rpcUrl);
  if(ledger.canary?.state==='verified')return ledger.canary;
  if(ledger.canary){if(await confirmed(c,ledger.canary.signature)&&ledger.canaryAccount&&(await account(c,ledger.canaryAccount)).state==='present'){ledger.canary.state='verified';await save(file,ledger);}return ledger.canary;}
  const k=await wallet(conf);let marker;
  try{
    const proof=k.sign(new TextEncoder().encode('rialo-sdk-probe:devnet:canary:v1')).toBytes();
    const seed=createHash('sha256').update(proof).digest();marker=Keypair.fromSecretKey(seed);seed.fill(0);proof.fill(0);
    const address=marker.publicKey.toString();ledger.canaryAccount=address;await save(file,ledger);
    if((await account(c,address)).state==='present')return {state:'existing_account_not_credited',address};
    const rent=await c.getMinimumBalanceForRentExemption(0n);
    if(rent>10_000_000n)throw Error('Rent exceeds test budget');
    await ensureFunds(c,conf,ledger,file,rent+BigInt(conf.maxFeeKelvin));
    const tx=TransactionBuilder.create().setPayer(k.publicKey).setValidFrom(BigInt(Date.now())).setConfigHashPrefix(await configHash(conf.rpcUrl))
      .addInstruction(createAccount(k.publicKey,marker.publicKey,rent,0n,PublicKey.fromString(SYSTEM_PROGRAM_ID))).build();
    return await sendOnce(c,conf,ledger,file,'canary',tx,[k,marker],[SYSTEM_PROGRAM_ID.toString()],async()=>{
      const a=await account(c,address);return a.state==='present'&&a.value.owner.toString()===SYSTEM_PROGRAM_ID.toString()&&a.value.space===0n;
    });
  }finally{k.dispose();marker?.dispose();}
}
