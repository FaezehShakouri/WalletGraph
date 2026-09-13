import test from 'node:test';
import assert from 'node:assert/strict';
import { activity, holding, utxo, valuation, position } from './fixtures.mjs';
import { validateRecords } from '../scripts/conformance.mjs';
import { tuple, sortKey } from '../scripts/ids.mjs';

for (const [name, factory] of Object.entries({ 'self-transfer': activity, 'exact holding': holding, 'private long Zcash address': () => holding(true), 'multi-input UTXO': utxo, 'net valuation': valuation, 'lending position': position })) {
  test(`accepts ${name}`, () => assert.deepEqual(validateRecords(factory().d), []));
}
function rejects(name, factory, mutate, pattern) {
  test(`rejects ${name}`, () => {
    const f = factory(); mutate(f);
    const errors = validateRecords(f.d);
    assert.ok(errors.some(e => pattern.test(e)), `Expected ${pattern}, got ${errors.join('\n')}`);
  });
}
rejects('unsafe JS numeric amount', holding, f => { f.d.BalanceObservation[0].amount = 9007199254740992; }, /exact integer string/);
rejects('negative amount', holding, f => { f.d.BalanceObservation[0].amount = '-1'; }, /nonnegative/);
rejects('shielded balance as zero', () => holding(true), f => { f.d.BalanceObservation[0].amount = '0'; }, /unavailable quantity/);
rejects('exact balance from partial history', holding, f => { f.d.BalanceObservation[0].method = 'PARTIAL_REPLAY'; }, /exact method/);
rejects('missing unknown reason', holding, f => { Object.assign(f.d.BalanceObservation[0], { availability: 'UNKNOWN', amount: null }); }, /requires reason/);
rejects('reversed coverage interval', holding, f => { f.d.Coverage[0].fromBlock = '101'; }, /reversed interval/);
rejects('duplicate membership', activity, f => { f.d.AccountActivity.push({ ...f.d.AccountActivity[0] }); }, /duplicate ID/);
rejects('failed successful movement', activity, f => { f.d.Activity[0].status = 'FAILURE'; }, /non-fee effect/);
rejects('stored reverse array', activity, f => { f.account.activities = []; }, /must not be stored/);
rejects('invalid feed cursor', activity, f => { f.d.AccountActivity[0].sortKey = 'random'; }, /sort key mismatch/);
rejects('wrong capability', holding, f => { f.d.Coverage[0].capability = 'ACTIVITY'; }, /requires HOLDINGS/);
rejects('fabricated truncated CAIP alias', () => holding(true), f => { f.account.caip10 = `example:zcash:${f.account.address}`; }, /CAIP-10/);
rejects('misresolved outpoint', utxo, f => { f.d.TransactionInput[0].previousOutputIndex = '99'; }, /outpoint mismatch/);
rejects('duplicate spend', utxo, f => { Object.assign(f.d.TransactionInput[1], { previousOutput: f.d.TransactionInput[0].previousOutput, previousOutputIndex: '0' }); }, /duplicate canonical spend/);
rejects('fabricated script owner', utxo, f => { f.d.TransactionOutput.at(-1).account = f.account.id; }, /endpoint\/address mismatch/);
rejects('unpriced debt hidden in net worth', valuation, f => { Object.assign(f.d.ValuationItem[1], { priceUSD: null, valueUSD: null }); }, /unpriced count mismatch/);
rejects('wrong net calculation', valuation, f => { f.d.PortfolioValuation[0].netValueUSD = '250'; }, /arithmetic mismatch/);
rejects('future price', valuation, f => { f.d.ValuationItem[0].priceTimestamp = '1700000001'; }, /future or undated/);
rejects('receipt and underlying double-count', valuation, f => { f.d.ValuationItem[1].exposureKey = 'deposit'; }, /duplicate economic exposure/);
rejects('wrong price multiplication', valuation, f => { f.d.ValuationItem[0].valueUSD = '201'; }, /item valuation arithmetic/);
rejects('incomplete position marked complete', position, f => { Object.assign(f.d.PositionComponent[0], { availability: 'UNKNOWN', amount: null, reason: 'missing' }); }, /unavailable component/);
rejects('unresolved source', activity, f => { f.d.Activity[0].transaction = 'absent'; }, /unresolved Transaction/);
rejects('cross-chain balance asset', holding, f => {
  f.d.Chain.push({ ...f.d.Chain[0], id: 'eip155:10' }); f.asset.chain = 'eip155:10';
}, /cross-chain reference/);
test('accepts failed action with fee only', () => {
  const f = activity(); f.d.Activity[0].status = 'FAILURE';
  const effect = f.d.AssetEffect[0]; effect.kind = 'FEE'; effect.id = tuple(effect.activity, effect.sourceLocator, effect.account, effect.kind);
  f.d.AssetEffect = [effect]; assert.deepEqual(validateRecords(f.d), []);
});
test('accepts partial valuation without net-worth claim', () => {
  const f = valuation(); Object.assign(f.d.ValuationItem[1], { priceUSD: null, valueUSD: null, priceSource: null, priceTimestamp: null });
  Object.assign(f.d.PortfolioValuation[0], { availability: 'PARTIAL', reason: 'Debt is unpriced', unpricedCount: '1', pricedLiabilitiesUSD: null, netValueUSD: null });
  assert.deepEqual(validateRecords(f.d), []);
});
test('accepts unknown decimals without changing raw quantity', () => {
  const f = holding(); f.asset.decimals = null; assert.deepEqual(validateRecords(f.d), []);
});
test('tuple IDs avoid delimiter collisions and preserve case/unicode', () => {
  assert.notEqual(tuple('a:b', 'c'), tuple('a', 'b:c'));
  assert.notEqual(tuple('chain:1', 'Ab'), tuple('chain:1', 'ab'));
  assert.notEqual(tuple('chain:1', 'a'), tuple('chain:2', 'a'));
  assert.equal(tuple('é'), '2:é');
  assert.throws(() => tuple('\ud800')); assert.throws(() => tuple('a\0b'));
});
test('ordering remains numeric beyond JS safe integer and deterministic on ties', () => {
  assert.ok(sortKey('999999999999999999', '0', 'a') < sortKey('1000000000000000000', '0', 'a'));
  assert.notEqual(sortKey('1', null, 'a'), sortKey('1', null, 'b'));
  assert.throws(() => sortKey('-1', '0', 'a'));
  assert.throws(() => sortKey('1' + '0'.repeat(40), '0', 'a'));
});

test('accepts coinbase with no previous outpoint', () => {
  const f = utxo();
  Object.assign(f.d.TransactionInput[0], { coinbase: true, previousTransactionHash: null, previousOutputIndex: null, previousOutput: null });
  assert.deepEqual(validateRecords(f.d), []);
});
test('accepts NFT base-unit counts with individual token identity', () => {
  const f = holding();
  const oldAsset = f.asset.id;
  Object.assign(f.asset, { namespace: 'erc721', reference: '0x2222222222222222222222222222222222222222', tokenId: '42', kind: 'NON_FUNGIBLE', decimals: 0 });
  f.asset.id = tuple(f.chain, f.asset.namespace, f.asset.reference, '42');
  const h = f.d.Holding[0], o = f.d.BalanceObservation[0];
  h.asset = f.asset.id; h.id = tuple(f.dataset.id, f.account.id, f.asset.id);
  o.holding = h.id; o.id = tuple(h.id, o.block); o.amount = '1'; h.latest = o.id;
  assert.notEqual(oldAsset, f.asset.id);
  assert.deepEqual(validateRecords(f.d), []);
});
rejects('missing UTXO capability', utxo, f => { f.d.Coverage[0].capability = 'ACTIVITY'; }, /UTXO coverage required/);

// Published synthetic exports must remain in sync with their executable examples.
const { readFileSync } = await import('node:fs');
for (const [name, factory] of [['ethereum-self-transfer', activity], ['zcash-private', () => holding(true)], ['bitcoin-inputs', utxo], ['lending-position', position], ['portfolio-valuation', valuation]]) {
  test(`published ${name} export conforms`, () => {
    const exported = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(exported, factory().d);
    assert.deepEqual(validateRecords(exported), []);
  });
}
