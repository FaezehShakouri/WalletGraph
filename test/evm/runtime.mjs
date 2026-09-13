import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/** Minimal deterministic Graph host for testing the actual compiled mapping.
 * Implements only imports used by this adapter; not a replacement for Graph Node.
 */
export async function mappingRuntime(network) {
  const manifest = parse(readFileSync(`subgraphs/evm/${network}.yaml`, 'utf8'));
  const context = Object.fromEntries(Object.entries(manifest.dataSources[0].context).map(([k,v]) => [k,v.data]));
  const records = new Map();
  let balances = {}, exports;
  const getString = ptr => ptr === 0 ? '' : Buffer.from(new Uint8Array(exports.memory.buffer, ptr,
    new DataView(exports.memory.buffer).getUint32(ptr - 4, true))).toString('utf16le');
  const newString = text => {
    const bytes = Buffer.from(text, 'utf16le');
    const ptr = exports.__new(bytes.length, 2);
    new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  };
  const getBytes = ptr => {
    const view = new DataView(exports.memory.buffer);
    return new Uint8Array(exports.memory.buffer, view.getUint32(ptr + 4, true), view.getUint32(ptr + 8, true));
  };
  const newBytes = bytes => {
    const ptr = exports.allocateBytes(bytes.length);
    getBytes(ptr).set(bytes); return ptr;
  };
  const newBigInt = text => {
    let n = BigInt(text);
    if (n < 0n) throw new Error('Negative BigInt outside adapter scope');
    const bytes = [];
    do { bytes.push(Number(n & 255n)); n >>= 8n; } while (n);
    bytes.push(0); return newBytes(bytes);
  };
  const getBigInt = ptr => {
    const bytes = getBytes(ptr);
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) + BigInt(bytes[i]);
    return n.toString();
  };
  const encode = fields => {
    const entity = exports.newEntity();
    for (const [key,{kind,value}] of Object.entries(fields)) {
      if (kind === 0) exports.setString(entity, newString(key), newString(value));
      else if (kind === 7) exports.setInteger(entity, newString(key), newString(value));
      else if (kind === 1) exports.setInt(entity, newString(key), value);
      else if (kind === 3) exports.setBool(entity, newString(key), value ? 1 : 0);
      else if (kind !== 5) throw new Error(`Unsupported test store kind ${kind}`);
    }
    return entity;
  };
  const instance = await WebAssembly.instantiate(readFileSync('build/mapping-harness.wasm'), {
    env: { abort: (message,file,line,column) => { throw new Error(`${getString(message)} at ${getString(file)}:${line}:${column}`); } },
    conversion: {
      'typeConversion.stringToH160': ptr => {
        const value = getString(ptr);
        if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('Invalid EVM address');
        return newBytes(Buffer.from(value.slice(2), 'hex'));
      },
      'typeConversion.bytesToHex': ptr => newString(`0x${Buffer.from(getBytes(ptr)).toString('hex')}`),
      'typeConversion.bigIntToString': ptr => newString(getBigInt(ptr)),
    },
    numbers: {
      'bigInt.fromString': ptr => newBigInt(getString(ptr)),
      'bigDecimal.toString': () => { throw new Error('Adapter unexpectedly uses BigDecimal'); },
    },
    datasource: { 'dataSource.context': () => encode(Object.fromEntries(Object.entries(context).map(([k,v]) => [k,{kind:0,value:v}]))) },
    index: {
      'store.get': (type,id) => {
        const row = records.get(`${getString(type)}\0${getString(id)}`);
        return row ? encode(row.fields) : 0;
      },
      'store.set': (type,id,entity) => {
        const fields = {};
        for (let i = 0; i < exports.fieldCount(entity); i++) {
          const key = getString(exports.fieldKey(entity,i)), kind = exports.fieldKind(entity,i);
          const text = getString(exports.fieldText(entity,i));
          fields[key] = { kind, value: kind === 1 ? Number(text) : kind === 3 ? text === 'true' : kind === 5 ? null : text };
        }
        records.set(`${getString(type)}\0${getString(id)}`, { type: getString(type), fields });
      },
    },
    ethereum: { 'ethereum.call': call => {
      if (getString(exports.callSignature(call)) !== 'balanceOf(address):(uint256)') throw new Error('Unexpected contract call');
      if (getString(exports.callContract(call)) !== manifest.dataSources[0].source.address) throw new Error('Wrong token call');
      const amount = balances[getString(exports.callAccount(call))];
      return amount == null ? 0 : exports.balanceResult(newString(BigInt(amount).toString()));
    } },
  });
  exports = instance.instance.exports;
  return {
    run(evidence, overrides = {}) {
      balances = overrides.balances ?? evidence.balances;
      const event = evidence.event;
      const values = [evidence.contract, `0x${event.topics[1].slice(-40)}`, `0x${event.topics[2].slice(-40)}`,
        BigInt(event.data).toString(), evidence.block.hash, BigInt(evidence.block.number).toString(),
        BigInt(evidence.block.timestamp).toString(), event.transactionHash, BigInt(event.transactionIndex).toString(), BigInt(event.logIndex).toString()];
      exports.runTransfer(...values.map(newString));
    },
    dump() {
      const result = {};
      for (const {type,fields} of records.values()) (result[type] ??= []).push(Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,v.value])));
      return result;
    },
    checkpoint: () => structuredClone(records),
    rollback(checkpoint) { records.clear(); for (const [k,v] of checkpoint) records.set(k,structuredClone(v)); },
  };
}
