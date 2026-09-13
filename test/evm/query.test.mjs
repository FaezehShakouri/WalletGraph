import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'graphql';
import { canonicalAddress } from '../../scripts/live/address.mjs';
import { inspectAddress, graphql } from '../../scripts/live/query.mjs';
import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { transferTopic } from '../../scripts/live/networks.mjs';

test('validates address length and mixed-case checksum before lowercasing', () => {
  assert.equal(canonicalAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  assert.throws(()=>canonicalAddress('0xA0b86991c6218b36c1d19D4a2e9eb0cE3606eB48'),/checksum/);
  assert.throws(()=>canonicalAddress('0x1234'),/20-byte/);
});
test('Transfer topic matches canonical ABI signature', () => {
  assert.equal(transferTopic,'0x'+Buffer.from(keccak256(Buffer.from('Transfer(address,address,uint256)'))).toString('hex'));
});
function provider(t,{reorg=false,wrongChain=false,indexingError=false}={}) {
  const requests=[];
  t.mock.method(globalThis,'fetch',async (_url,{body})=>{
    const {query,variables}=JSON.parse(body); parse(query); requests.push({query,variables});
    let data;
    if(query.includes('datasets(first:')) data={_meta:{block:{number:100,hash:'0xabc'},hasIndexingErrors:indexingError},datasets:[{id:'dataset',chain:{id:wrongChain?'eip155:8453':'eip155:1'},schemaVersion:'0.1.0'}]};
    else if(query.includes('_meta(block:')) data={_meta:{block:{hash:reorg?'0xdef':'0xabc'}}};
    else if(query.includes('account(id:')) data={account:null};
    else if(query.includes('coverages(')) data={coverages:[]};
    else if(query.includes('holdings(')) data={holdings:[]};
    else if(query.includes('assetEffects(')) data={assetEffects:[]};
    else if(query.includes('accountActivities(')) data={accountActivities:variables.cursor?[]:Array.from({length:100},(_,i)=>({id:String(i),sortKey:String(i+1).padStart(6,'0')}))};
    else throw new Error('Unexpected query');
    return {ok:true,json:async()=>({data})};
  });
  return requests;
}
test('client validates query syntax, pins pagination and distinguishes not-indexed from zero', async t=>{
  const requests=provider(t);
  const data=await inspectAddress('ethereum','0x1111111111111111111111111111111111111111','https://example.test');
  assert.equal(data.status,'NOT_INDEXED'); assert.equal(data.activities.length,100);
  assert.equal(requests.filter(r=>r.query.includes('accountActivities(')).length,2);
  assert.ok(requests.slice(1).every(r=>r.variables.at===100));
});
test('client rejects a reorganization during paging',async t=>{
  provider(t,{reorg:true}); await assert.rejects(inspectAddress('ethereum','0x1111111111111111111111111111111111111111','https://example.test'),/reorganized/);
});
test('client rejects wrong-network endpoint',async t=>{
  provider(t,{wrongChain:true}); await assert.rejects(inspectAddress('ethereum','0x1111111111111111111111111111111111111111','https://example.test'),/another chain/);
});
test('client rejects indexing errors',async t=>{
  provider(t,{indexingError:true}); await assert.rejects(inspectAddress('ethereum','0x1111111111111111111111111111111111111111','https://example.test'),/indexing errors/);
});
test('GraphQL errors cannot silently become empty wallet data',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({errors:[{message:'failure'}]})}));
  await assert.rejects(graphql('https://example.test','{account{id}}'),/rejected/);
});
