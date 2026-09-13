import { spawnSync } from 'node:child_process';
const cli='node_modules/@graphprotocol/graph-cli/bin/run.js';
for (const args of [
  [cli,'codegen','subgraphs/evm/ethereum.yaml','--output-dir','subgraphs/evm/generated','--skip-migrations'],
  [cli,'build','subgraphs/evm/ethereum.yaml','--output-dir','build/ethereum','--skip-migrations'],
  [cli,'build','subgraphs/evm/base.yaml','--output-dir','build/base','--skip-migrations'],
  ['node_modules/assemblyscript/bin/asc','test/evm/harness.ts','--lib','node_modules','--runtime','stub','--exportRuntime','--outFile','build/mapping-harness.wasm'],
]) {
  const run=spawnSync(process.execPath,args,{encoding:'utf8'});
  if(run.status!==0) { console.error(run.stdout,run.stderr); process.exit(run.status ?? 1); }
}
console.log('Ethereum and Base subgraphs built; actual mapping test harness compiled.');
