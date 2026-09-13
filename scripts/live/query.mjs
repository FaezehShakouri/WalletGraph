import './env.mjs';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { networks } from './networks.mjs';
import { canonicalAddress } from './address.mjs';
import { tuple } from '../ids.mjs';

export async function graphql(url, query, variables = {}) {
  let response;
  try { response = await fetch(url,{method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(30000)}); }
  catch { throw new Error('Graph provider connection failed (URL withheld)'); }
  if (!response.ok) throw new Error(`Graph provider HTTP ${response.status}`);
  const json = await response.json();
  if (json.errors?.length) throw new Error(`GraphQL request rejected (${json.errors.length} errors); check endpoint schema/version`);
  if (!json.data) throw new Error('Graph provider returned no data');
  return json.data;
}
export async function inspectAddress(name, address, url) {
  if (!networks[name]) throw new Error('Unknown network; choose ethereum or base');
  const canonical = canonicalAddress(address), id = tuple(networks[name].chainId,canonical);
  const metadata = await graphql(url,'{ _meta { block { number hash } hasIndexingErrors } datasets(first: 1) { id chain { id } schemaVersion } }');
  if (metadata._meta.hasIndexingErrors) throw new Error('Subgraph reports indexing errors');
  if (!metadata._meta.block.hash) throw new Error('Graph provider returned no stable block hash');
  if (metadata.datasets[0]?.chain.id !== networks[name].chainId || metadata.datasets[0]?.schemaVersion !== '0.1.0') throw new Error('Endpoint is uninitialized or uses another chain/schema');
  const at = metadata._meta.block.number;
  async function pages(root, query, variables = {}) {
    const result = []; let cursor='';
    for (;;) {
      const data = await graphql(url,query,{at,first:100,cursor,...variables});
      const page=data[root];
      if (!Array.isArray(page)) throw new Error(`Missing ${root} collection`);
      result.push(...page);
      if (page.length < 100) return result;
      const next = root === 'accountActivities' ? page.at(-1).sortKey : page.at(-1).id;
      if (next <= cursor) throw new Error('Non-advancing pagination cursor'); cursor=next;
    }
  }
  const account = await graphql(url,`query($id:ID!,$at:Int!){account(id:$id,block:{number:$at}){id address visibility chain{id name}}}`,{id,at});
  const coverage = await pages('coverages',`query($at:Int!,$first:Int!,$cursor:String!){coverages(block:{number:$at},first:$first,orderBy:id,orderDirection:asc,where:{id_gt:$cursor}){id capability scope scopeDescription availability reason fromBlock throughBlock{number hash}}}`);
  const holdings = await pages('holdings',`query($at:Int!,$first:Int!,$cursor:String!,$account:String!){holdings(block:{number:$at},first:$first,orderBy:id,orderDirection:asc,where:{account:$account,id_gt:$cursor}){id asset{id symbol decimals} latest{amount availability method reason block{number hash timestamp}}}}`,{account:id});
  const activities = await pages('accountActivities',`query($at:Int!,$first:Int!,$cursor:String!,$account:String!){accountActivities(block:{number:$at},first:$first,orderBy:sortKey,orderDirection:asc,where:{account:$account,sortKey_gt:$cursor}){id sortKey activity{id kind status timestamp sourceLocator transaction{hash}}}}`,{account:id});
  const effects = await pages('assetEffects',`query($at:Int!,$first:Int!,$cursor:String!,$account:String!){assetEffects(block:{number:$at},first:$first,orderBy:id,orderDirection:asc,where:{account:$account,id_gt:$cursor}){id kind amount activity{id} asset{id symbol decimals}}}`,{account:id});
  const end = await graphql(url,'query($at:Int!){_meta(block:{number:$at}){block{hash}}}',{at});
  if (end._meta.block.hash !== metadata._meta.block.hash) throw new Error('Chain reorganized during pagination; retry');
  return {network:name,chainId:networks[name].chainId,address:canonical,anchor:metadata._meta.block,
    account:account.account,status:account.account?'INDEXED_WITHIN_DECLARED_COVERAGE':'NOT_INDEXED',coverage,holdings,activities,effects};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name,address,file] = process.argv.slice(2);
  if (!networks[name] || !address) throw new Error('Usage: npm run query:wallet -- ethereum|base ADDRESS [output.json]');
  const url=process.env[`${name.toUpperCase()}_SUBGRAPH_URL`];
  if (!url) throw new Error(`Set ${name.toUpperCase()}_SUBGRAPH_URL in .env to the live Studio query URL`);
  const result=await inspectAddress(name,address,url), text=JSON.stringify(result,null,2)+'\n';
  if (file) await writeFile(file,text); else console.log(text);
}
