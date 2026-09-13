import './env.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { networks, transferTopic } from './networks.mjs';
import { rpc } from './rpc.mjs';

for (const [name, n] of Object.entries(networks)) {
  const url = process.env[n.rpcEnv] || n.publicRpc;
  if (await rpc(url, 'eth_chainId') !== n.rpcChainId) throw new Error(`${name}: wrong RPC network`);
  const block = await rpc(url, 'eth_getBlockByNumber', ['finalized', false]);
  const code = await rpc(url, 'eth_getCode', [n.token, block.number]);
  if (code === '0x') throw new Error(`${name}: missing contract`);
  const decimals = await rpc(url, 'eth_call', [{ to: n.token, data: '0x313ce567' }, block.number]);
  if (BigInt(decimals) !== 6n) throw new Error(`${name}: unexpected decimals`);
  const logs = await rpc(url, 'eth_getLogs', [{ address: n.token, fromBlock: block.number, toBlock: block.number, topics: [transferTopic] }]);
  const event = logs.find(l => l.topics.length === 3 && l.topics[1] !== l.topics[2] && !l.topics.slice(1).some(t => /^0x0{64}$/.test(t)) && !l.removed);
  if (!event) throw new Error(`${name}: finalized block has no suitable transfer; retry capture`);
  const transaction = await rpc(url, 'eth_getTransactionByHash', [event.transactionHash]);
  const receipt = await rpc(url, 'eth_getTransactionReceipt', [event.transactionHash]);
  if (receipt.status !== '0x1' || receipt.blockHash !== block.hash || event.blockHash !== block.hash) throw new Error('Inconsistent source evidence');
  const balances = {};
  for (const topic of event.topics.slice(1)) {
    const address = `0x${topic.slice(-40)}`;
    if (!/^0x0{40}$/.test(address)) balances[address] = await rpc(url, 'eth_call', [{ to: n.token, data: `0x70a08231${topic.slice(2)}` }, block.number]);
  }
  const verify = await rpc(url, 'eth_getBlockByNumber', [block.number, false]);
  if (verify.hash !== block.hash) throw new Error('Block changed during capture');
  const evidence = { provenance: { kind: 'LIVE_RPC_CAPTURE', capturedAt: new Date().toISOString(), provider: process.env[n.rpcEnv] ? 'user-configured RPC (URL withheld)' : n.publicRpc, limitation: 'One captured event, not a complete index or Graph-provider deployment.' }, network: name, chainId: n.chainId, contract: n.token, decimals: 6, block, event, transaction, receipt, balances };
  await mkdir('test/evm/evidence', { recursive: true });
  await writeFile(`test/evm/evidence/${name}.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`${name}: verified USDC transfer ${event.transactionHash} at block ${BigInt(block.number)}, ${Object.keys(balances).length} state balances`);
}
