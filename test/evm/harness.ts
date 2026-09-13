// Test-only harness. Production handleTransfer is imported unchanged.
import { Address, BigInt, Bytes, Entity, Value, ValueKind, ethereum } from '@graphprotocol/graph-ts';
import { Transfer } from '../../subgraphs/evm/generated/USDC/ERC20';
import { handleTransfer } from '../../subgraphs/evm/src/mapping';

export function runTransfer(token: string, from: string, to: string, amount: string,
  blockHash: string, height: string, timestamp: string, txHash: string, txIndex: string, logIndex: string): void {
  let zero = BigInt.zero();
  let hash = Bytes.fromHexString(blockHash);
  let sender = Address.fromString(from);
  let block = new ethereum.Block(hash, hash, hash, sender, hash, hash, hash,
    BigInt.fromString(height), zero, zero, BigInt.fromString(timestamp), zero, zero, null, null);
  let tx = new ethereum.Transaction(Bytes.fromHexString(txHash), BigInt.fromString(txIndex), sender,
    Address.fromString(token), zero, zero, zero, Bytes.fromHexString('0x'), zero);
  let params = [new ethereum.EventParam('from', ethereum.Value.fromAddress(sender)),
    new ethereum.EventParam('to', ethereum.Value.fromAddress(Address.fromString(to))),
    new ethereum.EventParam('value', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(amount)))];
  let event = new Transfer(Address.fromString(token), BigInt.fromString(logIndex), zero, null, block, tx, params, null);
  handleTransfer(event);
}
export function allocateBytes(length: i32): Bytes { return new Bytes(length); }
export function newEntity(): Entity { return new Entity(); }
export function setString(entity: Entity, key: string, value: string): void { entity.set(key, Value.fromString(value)); }
export function setInteger(entity: Entity, key: string, value: string): void { entity.set(key, Value.fromBigInt(BigInt.fromString(value))); }
export function setInt(entity: Entity, key: string, value: i32): void { entity.set(key, Value.fromI32(value)); }
export function setBool(entity: Entity, key: string, value: bool): void { entity.set(key, Value.fromBoolean(value)); }
export function fieldCount(entity: Entity): i32 { return entity.entries.length; }
export function fieldKey(entity: Entity, index: i32): string { return entity.entries[index].key; }
export function fieldKind(entity: Entity, index: i32): i32 { return entity.entries[index].value.kind; }
export function fieldText(entity: Entity, index: i32): string {
  let value = entity.entries[index].value;
  if (value.kind == ValueKind.BIGINT) return value.toBigInt().toString();
  if (value.kind == ValueKind.INT) return value.toI32().toString();
  if (value.kind == ValueKind.BOOL) return value.toBoolean() ? 'true' : 'false';
  if (value.kind == ValueKind.NULL) return '';
  return value.toString();
}
export function callAccount(call: ethereum.SmartContractCall): string { return call.functionParams[0].toAddress().toHexString(); }
export function callSignature(call: ethereum.SmartContractCall): string { return call.functionSignature; }
export function callContract(call: ethereum.SmartContractCall): string { return call.contractAddress.toHexString(); }
export function balanceResult(amount: string): ethereum.Value[] { return [ethereum.Value.fromUnsignedBigInt(BigInt.fromString(amount))]; }
