import { tuple, sortKey } from '../scripts/ids.mjs';
export function base(chain = 'eip155:1', address = '0x1111111111111111111111111111111111111111', ledgerModel = 'ACCOUNT') {
  const d = {};
  const add = (type, record) => { (d[type] ??= []).push(record); return record; };
  add('Chain', { id: chain, name: 'Synthetic example', identifierStandard: chain === 'example:zcash' ? 'https://example.org/experimental-zcash-profile' : 'CAIP-2', ledgerModel });
  const dataset = add('Dataset', { id: 'https://example.org/dataset', chain, schemaVersion: '0.1.0', subgraphVersion: '0.1.0', methodologyVersion: '0.1.0', methodology: 'https://example.org/method' });
  const block = add('Block', { id: tuple(chain, 'block-100'), chain, hash: 'block-100', number: '100', timestamp: '1700000000' });
  const account = add('Account', { id: tuple(chain, address), chain, address, addressFormat: `${ledgerModel.toLowerCase()}-example`, visibility: 'PUBLIC' });
  const asset = add('Asset', { id: tuple(chain, 'native', 'coin', ''), chain, namespace: 'native', reference: 'coin', kind: 'NATIVE', decimals: 8, symbol: 'TEST' });
  const coverage = kind => add('Coverage', { id: tuple(dataset.id, kind, 'fixture'), dataset: dataset.id, capability: kind, scope: 'fixture', scopeDescription: 'https://example.org/fixture-scope', availability: 'AVAILABLE', fromBlock: '0', throughBlock: block.id });
  return { d, add, chain, dataset, block, account, asset, coverage };
}
export function activity() {
  const f = base(), { add, chain, block, account, asset, coverage } = f;
  const scope = coverage('ACTIVITY');
  const tx = add('Transaction', { id: tuple(chain, 'tx-1'), hash: 'tx-1', block: block.id, index: '0', status: 'SUCCESS' });
  const id = tuple(tx.id, 'log:0');
  const action = add('Activity', { id, transaction: tx.id, coverage: scope.id, kind: 'TRANSFER', status: 'SUCCESS', sourceLocator: 'log:0', timestamp: block.timestamp, sortKey: sortKey(block.number, tx.index, id) });
  const member = add('AccountActivity', { id: tuple(account.id, id), account: account.id, activity: id, sortKey: action.sortKey });
  for (const role of ['SENDER', 'RECIPIENT']) add('ActivityRole', { id: tuple(member.id, role), membership: member.id, role });
  for (const kind of ['DEBIT', 'CREDIT']) add('AssetEffect', { id: tuple(id, 'log:0', account.id, kind), activity: id, account: account.id, asset: asset.id, kind, amount: '9007199254740993000000', sourceLocator: 'log:0' });
  return f;
}
export function holding(shielded = false) {
  const f = shielded ? base('example:zcash', 'u' + 'a'.repeat(180), 'HYBRID') : base();
  const { add, account, asset, block, dataset, coverage } = f;
  const scope = coverage('HOLDINGS');
  if (shielded) {
    account.visibility = 'SHIELDED';
    Object.assign(scope, { availability: 'PRIVATE', fromBlock: null, throughBlock: null, reason: 'Shielded data cannot be discovered from a public address.' });
  }
  const id = tuple(dataset.id, account.id, asset.id), observation = tuple(id, block.id);
  add('Holding', { id, account: account.id, asset: asset.id, coverage: scope.id, latest: observation });
  add('BalanceObservation', { id: observation, holding: id, block: block.id, availability: shielded ? 'PRIVATE' : 'AVAILABLE', amount: shielded ? null : '250000000', method: shielded ? 'UNKNOWN' : 'STATE_READ', reason: shielded ? 'Public visibility unavailable.' : null });
  return f;
}
export function utxo() {
  const f = base('bip122:000000000019d6689c085ae165831e93', '128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6', 'UTXO');
  const { add, chain, account, asset, block, coverage } = f;
  coverage('UTXO');
  const old = add('Transaction', { id: tuple(chain, 'prior'), block: block.id, hash: 'prior', index: '0', status: 'SUCCESS' });
  const tx = add('Transaction', { id: tuple(chain, 'spend'), block: block.id, hash: 'spend', index: '1', status: 'SUCCESS' });
  for (let i = 0; i < 2; i++) {
    const out = add('TransactionOutput', { id: tuple(old.id, String(i)), transaction: old.id, index: String(i), asset: asset.id, amount: '20000', endpointKind: 'ADDRESS', account: account.id });
    add('TransactionInput', { id: tuple(tx.id, String(i)), transaction: tx.id, index: String(i), coinbase: false, previousTransactionHash: old.hash, previousOutputIndex: String(i), previousOutput: out.id });
  }
  add('TransactionOutput', { id: tuple(tx.id, '0'), transaction: tx.id, index: '0', asset: asset.id, amount: '39000', endpointKind: 'SCRIPT', script: 'synthetic-locking-script' });
  return f;
}
export function valuation() {
  const f = base(), { add, account, asset, block, dataset, coverage } = f;
  const scope = coverage('VALUATION');
  const val = add('PortfolioValuation', { id: tuple(dataset.id, account.id, block.id, '0.1.0'), account: account.id, coverage: scope.id, block: block.id, methodologyVersion: '0.1.0', availability: 'AVAILABLE', pricedAssetsUSD: '200', pricedLiabilitiesUSD: '50', netValueUSD: '150', unpricedCount: '0' });
  for (const [role, exposureKey, amount, valueUSD] of [['ASSET', 'deposit', '200000000', '200'], ['LIABILITY', 'debt', '50000000', '50']]) {
    add('ValuationItem', { id: tuple(val.id, exposureKey), valuation: val.id, asset: asset.id, role, exposureKey, source: `fixture:${exposureKey}`, amount, decimals: 8, priceUSD: '100', priceSource: 'fixture:price', priceTimestamp: block.timestamp, valueUSD });
  }
  return f;
}
export function position() {
  const f = base(), { add, chain, account, asset, block, dataset, coverage } = f;
  const scope = coverage('POSITIONS');
  const protocol = add('Protocol', { id: tuple(chain, 'example-lending-v1'), chain, name: 'Example lending' });
  const pos = add('Position', { id: tuple(dataset.id, account.id, protocol.id, 'market-1'), account: account.id, protocol: protocol.id, coverage: scope.id, sourceKey: 'market-1', kind: 'LENDING', status: 'OPEN', observedAt: block.id, componentsComplete: true });
  for (const [role, amount] of [['ASSET', '200000000'], ['LIABILITY', '50000000']]) add('PositionComponent', { id: tuple(pos.id, role), position: pos.id, asset: asset.id, role, availability: 'AVAILABLE', amount });
  return f;
}
