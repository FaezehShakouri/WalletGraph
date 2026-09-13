import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mappingRuntime } from './runtime.mjs';
import { validateRecords } from '../../scripts/conformance.mjs';
import { tuple } from '../../scripts/ids.mjs';
const source = network => JSON.parse(readFileSync(`test/evm/evidence/${network}.json`, 'utf8'));

for (const network of ['ethereum','base']) {
  test(`${network}: actual WASM mapping reproduces captured Transfer and balanceOf evidence`, async () => {
    const evidence = source(network), runtime = await mappingRuntime(network);
    runtime.run(evidence);
    const data = runtime.dump();
    assert.deepEqual(validateRecords(data), []);
    assert.equal(data.Activity.length, 1);
    assert.equal(data.Activity[0].transaction, tuple(evidence.chainId,evidence.event.transactionHash));
    assert.equal(data.Asset[0].reference, evidence.contract);
    for (const effect of data.AssetEffect) assert.equal(effect.amount, BigInt(evidence.event.data).toString());
    for (const holding of data.Holding) {
      const account = data.Account.find(a => a.id === holding.account);
      const observation = data.BalanceObservation.find(o => o.id === holding.latest);
      assert.equal(observation.amount, BigInt(evidence.balances[account.address]).toString());
      assert.equal(observation.method, 'STATE_READ');
    }
  });
  test(`${network}: replay is idempotent and host rollback removes orphaned records`, async () => {
    const evidence = source(network), runtime = await mappingRuntime(network);
    const before = runtime.checkpoint();
    runtime.run(evidence); const once = runtime.dump();
    runtime.run(evidence); assert.deepEqual(runtime.dump(),once);
    runtime.rollback(before); assert.deepEqual(runtime.dump(),{});
    runtime.run(evidence); assert.deepEqual(runtime.dump(),once);
  });
}
test('self-transfer has one feed membership, two roles and zero net transfer', async () => {
  const evidence = source('ethereum'); evidence.event.topics[2] = evidence.event.topics[1];
  const runtime = await mappingRuntime('ethereum'); runtime.run(evidence);
  const data = runtime.dump();
  assert.deepEqual(validateRecords(data),[]);
  assert.equal(data.AccountActivity.length,1); assert.equal(data.ActivityRole.length,2);
  assert.deepEqual(data.AssetEffect.map(e => e.kind),['DEBIT','CREDIT']);
  assert.equal(data.BalanceObservation.length,1);
});
for (const [endpoint,kind] of [[1,'MINT'],[2,'BURN']]) {
  test(`${kind}: zero address is not an owner`, async () => {
    const evidence = source('ethereum'); evidence.event.topics[endpoint] = '0x'+'0'.repeat(64);
    const runtime = await mappingRuntime('ethereum'); runtime.run(evidence);
    const data = runtime.dump();
    assert.deepEqual(validateRecords(data),[]);
    assert.equal(data.Account.length,1); assert.equal(data.AssetEffect[0].kind,kind);
  });
}
test('reverted balanceOf stays UNKNOWN, never zero or transfer sum', async () => {
  const runtime = await mappingRuntime('ethereum'); runtime.run(source('ethereum'),{balances:{}});
  const data = runtime.dump(); assert.deepEqual(validateRecords(data),[]);
  for (const o of data.BalanceObservation) { assert.equal(o.availability,'UNKNOWN'); assert.equal(o.amount,undefined); }
});
test('multiple logs in one transaction have distinct activities and one transaction', async () => {
  const evidence = source('ethereum'), runtime = await mappingRuntime('ethereum');
  runtime.run(evidence); evidence.event.logIndex = `0x${(BigInt(evidence.event.logIndex)+1n).toString(16)}`; runtime.run(evidence);
  const data = runtime.dump(); assert.deepEqual(validateRecords(data),[]);
  assert.equal(data.Transaction.length,1); assert.equal(data.Activity.length,2);
  assert.equal(data.BalanceObservation.length,2);
});
