import { readFile, writeFile } from 'node:fs/promises';
import { networks } from './networks.mjs';
const methodology = 'WalletGraph USDC EVM adapter 0.1.0. Scope: Transfer logs emitted by the configured Circle USDC contract from startBlock inclusive. Each log is a low-level token transfer, not a decoded swap or deposit. Zero-address endpoints are mint/burn markers, not owners. No fees, native ETH, reverted transactions, approvals, DeFi positions, prices, or other contracts are covered. balanceOf is read at the event block end for nonzero transfer participants only; readings are refreshed only when that address appears in another Transfer log. A failed state call produces UNKNOWN/null, never a replay-derived balance. Coverage watermark is the last matching event block and is conservative during empty blocks. Graph Node rollback must remove orphaned entities. No finality claim is stored. Dataset is public.';
for (const [name, n] of Object.entries(networks)) {
  const evidence = JSON.parse(await readFile(`test/evm/evidence/${name}.json`, 'utf8'));
  const start = BigInt(evidence.block.number).toString();
  const context = { chainId: n.chainId, chainName: n.name, datasetId: `urn:walletgraph:usdc:${name}:v0.1`, startBlock: start, methodology: `data:text/plain;charset=utf-8,${encodeURIComponent(methodology)}` };
  const text = `specVersion: 1.3.0
schema:
  file: ../../schema.graphql
indexerHints:
  prune: never
dataSources:
  - kind: ethereum/contract
    name: USDC
    network: ${n.graphNetwork}
    source:
      address: '${n.token}'
      abi: ERC20
      startBlock: ${start}
    context:
${Object.entries(context).map(([key,value]) => `      ${key}:\n        type: String\n        data: ${JSON.stringify(value)}`).join('\n')}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Chain
        - Dataset
        - Coverage
        - Account
        - Asset
        - Block
        - Transaction
        - Activity
        - AccountActivity
        - ActivityRole
        - AssetEffect
        - Holding
        - BalanceObservation
      abis:
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransfer
      file: ./src/mapping.ts
`;
  await writeFile(`subgraphs/evm/${name}.yaml`, text);
  console.log(`${name}: manifest starts at verified evidence block ${start}`);
}
