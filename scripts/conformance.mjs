import { readFileSync } from 'node:fs';
import { parse, Kind } from 'graphql';
import { tuple, sortKey } from './ids.mjs';

const ast = parse(readFileSync(new URL('../schema.graphql', import.meta.url), 'utf8'));
const types = new Map(ast.definitions.map(d => [d.name.value, d]));
const enums = new Map(ast.definitions.filter(d => d.kind === Kind.ENUM_TYPE_DEFINITION)
  .map(d => [d.name.value, new Set(d.values.map(v => v.name.value))]));
const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Validate a complete synthetic/exported dataset, not arbitrary partial GraphQL pages.
 * Returns diagnostics; never asserts native-chain truth from schema shape alone.
 */
export function validateRecords(records) {
  const errors = [];
  const fail = (where, message) => errors.push(`${where}: ${message}`);
  const maps = new Map();
  const rows = name => records[name] ?? [];
  const ref = (name, id) => maps.get(name)?.get(id);
  for (const [name, values] of Object.entries(records)) {
    if (!types.has(name) || types.get(name).kind !== Kind.OBJECT_TYPE_DEFINITION) {
      fail(name, 'unknown entity type'); continue;
    }
    if (!Array.isArray(values)) { fail(name, 'expected array'); continue; }
    const map = new Map(); maps.set(name, map);
    for (const row of values) {
      if (!row || typeof row !== 'object') { fail(name, 'expected record'); continue; }
      if (map.has(row.id)) fail(name, `duplicate ID ${row.id}`);
      map.set(row.id, row);
    }
  }
  function checkValue(type, value, path) {
    if (type.kind === Kind.NON_NULL_TYPE) {
      if (value == null) { fail(path, 'required value missing'); return; }
      return checkValue(type.type, value, path);
    }
    if (value == null) return;
    const name = type.name?.value;
    if (enums.has(name)) { if (!enums.get(name).has(value)) fail(path, 'invalid enum'); return; }
    if (types.get(name)?.kind === Kind.OBJECT_TYPE_DEFINITION) {
      if (typeof value !== 'string' || !ref(name, value)) fail(path, `unresolved ${name} reference`);
      return;
    }
    if (name === 'String' && (typeof value !== 'string' || value.includes('\0') || !value.isWellFormed())) fail(path, 'invalid string');
    if (name === 'Boolean' && typeof value !== 'boolean') fail(path, 'expected boolean');
    if (name === 'Int' && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) fail(path, 'invalid Int');
    if (name === 'BigInt' && (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value))) fail(path, 'expected nonnegative exact integer string');
    if (name === 'BigDecimal' && (typeof value !== 'string' || !decimal.test(value) || value.replace(/[-.]/g, '').replace(/^0+/, '').length > 34)) fail(path, 'invalid decimal or exceeds 34 significant digits');
  }
  for (const [name, map] of maps) for (const row of map.values()) {
    const fields = types.get(name).fields;
    for (const key of Object.keys(row)) if (!fields.some(f => f.name.value === key)) fail(name, `unknown field ${key}`);
    for (const field of fields) {
      const key = field.name.value;
      if (field.directives.some(d => d.name.value === 'derivedFrom')) {
        if (Object.hasOwn(row, key)) fail(`${name}.${key}`, 'derived relationship must not be stored');
      } else checkValue(field.type, row[key], `${name}.${key}`);
    }
  }
  // Reject malformed shapes before semantic traversal to return errors, not throw.
  if (errors.length) return errors;
  const ensure = (condition, row, message) => { if (!condition) fail(row.id, message); };
  const same = (a, b, row) => ensure(a === b, row, 'cross-chain reference');
  const getChain = (name, id) => {
    const row = ref(name, id);
    if (row.chain) return row.chain;
    if (name === 'Block') return row.chain;
    if (name === 'Transaction') return getChain('Block', row.block);
    if (name === 'Activity') return getChain('Transaction', row.transaction);
    if (name === 'Coverage') return getChain('Dataset', row.dataset);
    throw new Error(`No chain path for ${name}`);
  };
  const capability = (row, kind, chain) => {
    const coverage = ref('Coverage', row.coverage);
    ensure(coverage.capability === kind, row, `requires ${kind} coverage`);
    same(getChain('Coverage', row.coverage), chain, row);
  };
  const unavailable = row => {
    if (row.availability !== 'AVAILABLE') ensure(Boolean(row.reason?.trim()), row, 'non-available data requires reason');
    if (['PRIVATE', 'UNSUPPORTED', 'UNKNOWN'].includes(row.availability)) ensure(row.amount == null, row, 'unavailable quantity must be null');
    if (row.availability === 'AVAILABLE') ensure(row.amount != null, row, 'available quantity required');
  };
  ensure(rows('Dataset').length === 1, { id: 'Dataset' }, 'exactly one dataset required');
  ensure(rows('Chain').length === 1, { id: 'Chain' }, 'one chain per deployment required');
  ensure(rows('Coverage').length > 0, { id: 'Coverage' }, 'at least one coverage required');
  for (const row of rows('Dataset')) for (const key of ['schemaVersion', 'subgraphVersion', 'methodologyVersion']) {
    ensure(/^\d+\.\d+\.\d+$/.test(row[key]), row, `invalid ${key}`);
  }
  for (const row of rows('Coverage')) {
    ensure(row.id === tuple(row.dataset, row.capability, row.scope), row, 'invalid coverage ID');
    if (row.availability !== 'AVAILABLE') ensure(Boolean(row.reason?.trim()), row, 'coverage reason required');
    if (['AVAILABLE', 'PARTIAL'].includes(row.availability)) {
      ensure(row.fromBlock != null && row.throughBlock != null, row, 'covered interval required');
      if (row.throughBlock) ensure(BigInt(row.fromBlock ?? '0') <= BigInt(ref('Block', row.throughBlock).number), row, 'reversed interval');
    } else ensure(row.fromBlock == null && row.throughBlock == null, row, 'unavailable coverage cannot claim interval');
    if (row.throughBlock) same(getChain('Block', row.throughBlock), getChain('Dataset', row.dataset), row);
  }
  for (const row of rows('Account')) {
    ensure(row.id === tuple(row.chain, row.address), row, 'invalid account ID');
    if (row.chain.startsWith('eip155:')) ensure(/^0x[0-9a-f]{40}$/.test(row.address), row, 'noncanonical EVM address');
    if (row.caip10) ensure(row.caip10 === `${row.chain}:${row.address}` && /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:[-.%a-zA-Z0-9]{1,128}$/.test(row.caip10), row, 'invalid CAIP-10 alias');
  }
  for (const row of rows('Asset')) {
    ensure(row.id === tuple(row.chain, row.namespace, row.reference, row.tokenId ?? ''), row, 'invalid asset ID');
    ensure(row.decimals == null || (row.decimals >= 0 && row.decimals <= 1000), row, 'decimals outside v0.1 bounds');
    ensure(['NON_FUNGIBLE', 'MULTI_TOKEN'].includes(row.kind) ? row.tokenId != null : row.tokenId == null, row, 'invalid token ID applicability');
  }
  for (const row of rows('Block')) ensure(row.id === tuple(row.chain, row.hash), row, 'invalid block ID');
  for (const row of rows('Transaction')) ensure(row.id === tuple(getChain('Transaction', row.id), row.hash), row, 'invalid transaction ID');
  for (const row of rows('Activity')) {
    const tx = ref('Transaction', row.transaction), block = ref('Block', tx.block);
    ensure(row.id === tuple(row.transaction, row.sourceLocator), row, 'invalid activity ID');
    capability(row, 'ACTIVITY', block.chain);
    ensure((row.kind === 'OTHER') === Boolean(row.customKind), row, 'customKind is only required for OTHER');
    ensure((row.timestamp ?? null) === (block.timestamp ?? null), row, 'timestamp mismatch');
    try { ensure(row.sortKey === sortKey(block.number, tx.index, row.id), row, 'invalid sort key'); } catch { fail(row.id, 'invalid sort key bounds'); }
    if (row.protocol) same(ref('Protocol', row.protocol).chain, block.chain, row);
    ensure(tx.status !== 'FAILURE' || row.status !== 'SUCCESS', row, 'successful action in failed transaction');
  }
  for (const row of rows('AccountActivity')) {
    ensure(row.id === tuple(row.account, row.activity), row, 'invalid membership ID');
    same(ref('Account', row.account).chain, getChain('Activity', row.activity), row);
    ensure(row.sortKey === ref('Activity', row.activity).sortKey, row, 'membership sort key mismatch');
  }
  for (const row of rows('ActivityRole')) ensure(row.id === tuple(row.membership, row.role), row, 'invalid role ID');
  const evidence = new Set();
  for (const row of rows('AssetEffect')) {
    const activity = ref('Activity', row.activity);
    ensure(row.id === tuple(row.activity, row.sourceLocator, row.account, row.kind), row, 'invalid effect ID');
    const chain = getChain('Activity', row.activity);
    same(ref('Account', row.account).chain, chain, row); same(ref('Asset', row.asset).chain, chain, row);
    ensure(Boolean(ref('AccountActivity', tuple(row.account, row.activity))), row, 'effect missing account membership');
    ensure(activity.status !== 'FAILURE' || row.kind === 'FEE', row, 'non-fee effect on failed action');
    const key = tuple(activity.transaction, row.sourceLocator, row.account, ['DEBIT', 'FEE', 'BURN'].includes(row.kind) ? 'OUT' : 'IN');
    ensure(!evidence.has(key), row, 'duplicate economic effect'); evidence.add(key);
  }
  for (const row of rows('Holding')) {
    const coverage = ref('Coverage', row.coverage);
    ensure(row.id === tuple(coverage.dataset, row.account, row.asset), row, 'invalid holding ID');
    same(ref('Account', row.account).chain, ref('Asset', row.asset).chain, row);
    capability(row, 'HOLDINGS', ref('Account', row.account).chain);
    const latest = ref('BalanceObservation', row.latest);
    ensure(latest.holding === row.id, row, 'latest belongs to another holding');
    for (const observation of rows('BalanceObservation').filter(o => o.holding === row.id)) {
      ensure(BigInt(ref('Block', latest.block).number) >= BigInt(ref('Block', observation.block).number), row, 'latest is stale relative to stored observations');
    }
  }
  for (const row of rows('BalanceObservation')) {
    ensure(row.id === tuple(row.holding, row.block), row, 'invalid observation ID');
    same(ref('Account', ref('Holding', row.holding).account).chain, getChain('Block', row.block), row);
    unavailable(row);
    if (row.availability === 'AVAILABLE') ensure(['STATE_READ', 'COMPLETE_REPLAY', 'AUTHORIZED_VIEW'].includes(row.method), row, 'exact balance requires exact method');
  }
  for (const row of rows('Position')) {
    const chain = ref('Account', row.account).chain;
    same(chain, ref('Protocol', row.protocol).chain, row); same(chain, getChain('Block', row.observedAt), row);
    capability(row, 'POSITIONS', chain);
    ensure(row.id === tuple(ref('Coverage', row.coverage).dataset, row.account, row.protocol, row.sourceKey), row, 'invalid position ID');
    if (row.componentsComplete) ensure(rows('PositionComponent').filter(c => c.position === row.id).every(c => c.availability === 'AVAILABLE'), row, 'complete position has unavailable component');
  }
  for (const row of rows('PositionComponent')) {
    unavailable(row);
    same(ref('Asset', row.asset).chain, ref('Account', ref('Position', row.position).account).chain, row);
  }
  for (const row of rows('TransactionOutput')) {
    ensure(rows('Coverage').some(c => c.capability === 'UTXO' && ['AVAILABLE', 'PARTIAL'].includes(c.availability)), row, 'UTXO coverage required');
    ensure(row.id === tuple(row.transaction, row.index), row, 'invalid output ID');
    same(ref('Asset', row.asset).chain, getChain('Transaction', row.transaction), row);
    ensure((row.endpointKind === 'ADDRESS') === Boolean(row.account), row, 'endpoint/address mismatch');
    if (row.account) same(ref('Account', row.account).chain, getChain('Transaction', row.transaction), row);
    if (row.endpointKind === 'SCRIPT') ensure(Boolean(row.script), row, 'script endpoint needs script');
  }
  const spent = new Set();
  for (const row of rows('TransactionInput')) {
    ensure(rows('Coverage').some(c => c.capability === 'UTXO' && ['AVAILABLE', 'PARTIAL'].includes(c.availability)), row, 'UTXO coverage required');
    ensure(row.id === tuple(row.transaction, row.index), row, 'invalid input ID');
    if (row.coinbase) ensure(row.previousOutput == null && row.previousOutputIndex == null && row.previousTransactionHash == null, row, 'coinbase has no previous outpoint');
    else {
      ensure(row.previousOutputIndex != null && Boolean(row.previousTransactionHash), row, 'input requires source outpoint');
      const key = tuple(getChain('Transaction', row.transaction), row.previousTransactionHash ?? '', row.previousOutputIndex ?? '');
      ensure(!spent.has(key), row, 'duplicate canonical spend'); spent.add(key);
    }
    if (row.previousOutput) {
      const out = ref('TransactionOutput', row.previousOutput), tx = ref('Transaction', out.transaction);
      ensure(tx.hash === row.previousTransactionHash && out.index === row.previousOutputIndex, row, 'outpoint mismatch');
      same(getChain('Transaction', row.transaction), getChain('Transaction', tx.id), row);
    }
  }
  // Fixed 18-place arithmetic avoids floating point when checking valuation totals.
  const scaled = value => {
    const [whole, frac = ''] = value.split('.');
    if (frac.length > 18) throw new Error('more than 18 fractional places');
    const negative = whole.startsWith('-');
    return (negative ? -1n : 1n) * (BigInt(whole.replace('-', '')) * 10n ** 18n + BigInt(frac.padEnd(18, '0')));
  };
  for (const row of rows('PortfolioValuation')) {
    capability(row, 'VALUATION', ref('Account', row.account).chain);
    same(getChain('Block', row.block), ref('Account', row.account).chain, row);
    ensure(row.id === tuple(ref('Coverage', row.coverage).dataset, row.account, row.block, row.methodologyVersion), row, 'invalid valuation ID');
    const items = rows('ValuationItem').filter(i => i.valuation === row.id);
    ensure(BigInt(row.unpricedCount) === BigInt(items.filter(i => i.valueUSD == null).length), row, 'unpriced count mismatch');
    if (row.availability !== 'AVAILABLE') {
      ensure(Boolean(row.reason), row, 'partial valuation needs reason');
      ensure(row.netValueUSD == null, row, 'partial valuation cannot claim net worth');
    } else ensure(row.unpricedCount === '0' && ref('Coverage', row.coverage).availability === 'AVAILABLE', row, 'complete valuation has missing coverage/prices');
    try {
      for (const [role, field] of [['ASSET', 'pricedAssetsUSD'], ['LIABILITY', 'pricedLiabilitiesUSD']]) {
        const side = items.filter(i => i.role === role), priced = side.filter(i => i.valueUSD != null);
        if (side.length && !priced.length) ensure(row[field] == null, row, 'unpriced side cannot claim zero');
        else ensure(row[field] != null && scaled(row[field]) === priced.reduce((sum, i) => sum + scaled(i.valueUSD), 0n), row, 'subtotal mismatch');
      }
      if (row.availability === 'AVAILABLE') ensure(row.netValueUSD != null && scaled(row.netValueUSD) === scaled(row.pricedAssetsUSD) - scaled(row.pricedLiabilitiesUSD), row, 'net worth arithmetic mismatch');
    } catch { fail(row.id, 'invalid valuation precision'); }
    const keys = new Set();
    for (const item of items) { ensure(!keys.has(item.exposureKey), item, 'duplicate economic exposure'); keys.add(item.exposureKey); }
  }
  for (const row of rows('ValuationItem')) {
    ensure(row.id === tuple(row.valuation, row.exposureKey), row, 'invalid valuation item ID');
    const val = ref('PortfolioValuation', row.valuation), block = ref('Block', val.block);
    same(ref('Asset', row.asset).chain, block.chain, row);
    if (row.priceUSD != null) {
      ensure(Boolean(row.priceSource) && row.priceTimestamp != null, row, 'price provenance missing');
      ensure(block.timestamp != null && BigInt(row.priceTimestamp ?? '0') <= BigInt(block.timestamp ?? '0'), row, 'future or undated price');
      ensure(!row.priceUSD.startsWith('-'), row, 'negative price');
    }
    const computable = row.amount != null && row.decimals != null && row.priceUSD != null;
    ensure(computable === (row.valueUSD != null), row, 'value/inputs mismatch');
    if (computable) {
      try {
        if (row.decimals < 0 || row.decimals > 1000) throw new Error('unsupported decimal scale');
        const [whole, frac = ''] = row.priceUSD.split('.');
        const numerator = BigInt(row.amount) * BigInt(whole + frac) * 10n ** 18n;
        const divisor = 10n ** BigInt(row.decimals + frac.length);
        const rounded = (numerator + divisor / 2n) / divisor;
        ensure(scaled(row.valueUSD) === rounded, row, 'item valuation arithmetic mismatch');
      } catch { fail(row.id, 'invalid item precision'); }
    }
  }
  return errors;
}
