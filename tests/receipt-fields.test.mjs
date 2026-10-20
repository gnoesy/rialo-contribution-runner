import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseReceipt} from '../src/receipt.mjs';

const original=JSON.parse(await readFile(new URL('./fixtures/canary-rpc.json',import.meta.url),'utf8'));
const signature=original.result.transaction.signatures[0];
const fields=[
  {name:'fee',parent:r=>r.result.meta,key:'fee',output:'feeKelvin'},
  {name:'blockHeight',parent:r=>r.result,key:'block_height',alias:'blockHeight',output:'blockHeight'},
  {name:'validFrom',parent:r=>r.result.transaction,key:'validFrom',alias:'valid_from',output:'validFrom'},
];
const parse=r=>parseReceipt(JSON.stringify(r),signature);
const invalid=[null,-1,-0.5,0.5,Number.MAX_SAFE_INTEGER+1,true,false,'',' ','-1','-0','1.5','1e3','+1','01',' 1','1 ','1\n','1\r\n','1\t','NaN','Infinity','0x10',{},[],[1]];
for(const f of fields){
  test(`${f.name}: missing or malformed values never become receipt strings`,()=>{
    const missing=structuredClone(original);delete f.parent(missing)[f.key];
    assert.throws(()=>parse(missing),new RegExp(`Missing ${f.name}`));
    for(const value of invalid){
      const r=structuredClone(original);f.parent(r)[f.key]=value;
      assert.throws(()=>parse(r),/Invalid|Unsafe/,`${f.name} accepted ${JSON.stringify(value)}`);
    }
    // JSON.stringify erases the sign of -0; test the actual wire text instead.
    const r=structuredClone(original);f.parent(r)[f.key]=12345;
    assert.throws(()=>parseReceipt(JSON.stringify(r).replace(`"${f.key}":12345`,`"${f.key}":-0`),signature),/Invalid/);
  });
  test(`${f.name}: zero, safe boundary and large decimal strings are exact`,()=>{
    for(const value of [0,Number.MAX_SAFE_INTEGER,'0','9007199254740993','18446744073709551615']){
      const r=structuredClone(original);f.parent(r)[f.key]=value;
      assert.equal(parse(r)[f.output],String(value));
    }
  });
  if(f.alias){
    test(`${f.name}: supported aliases cannot hide invalid or conflicting values`,()=>{
      const r=structuredClone(original);const parent=f.parent(r);const value=parent[f.key];
      delete parent[f.key];parent[f.alias]=value;
      assert.equal(parse(r)[f.output],String(value));
      parent[f.key]=String(value);
      assert.equal(parse(r)[f.output],String(value));
      parent[f.key]=null;
      assert.throws(()=>parse(r),/Invalid/);
      parent[f.key]=String(BigInt(value)+1n);
      assert.throws(()=>parse(r),/Conflicting/);
      parent[f.key]=value;parent[f.alias]=null;
      assert.throws(()=>parse(r),/Invalid/);
    });
  }
}
