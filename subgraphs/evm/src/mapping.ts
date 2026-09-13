import { Address, BigInt, Bytes, dataSource } from '@graphprotocol/graph-ts';
import { Transfer, ERC20 } from '../generated/USDC/ERC20';
import { Chain, Dataset, Coverage, Account, Asset, Block, Transaction, Activity,
  AccountActivity, ActivityRole, AssetEffect, Holding, BalanceObservation } from '../generated/schema';

// UTF-8 byte lengths match scripts/ids.mjs, including non-ASCII documentation IDs.
export function tuple(parts: string[]): string {
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    result += Bytes.fromUTF8(parts[i]).length.toString() + ':' + parts[i];
  }
  return result;
}
function pad40(value: BigInt): string {
  let s = value.toString();
  assert(s.length <= 40 && !s.startsWith('-'), 'Ordering component outside v0.1 bounds');
  while (s.length < 40) s = '0' + s;
  return s;
}
function membership(account: Account, activity: Activity, role: string): void {
  let id = tuple([account.id, activity.id]);
  let member = new AccountActivity(id);
  member.account = account.id;
  member.activity = activity.id;
  member.sortKey = activity.sortKey;
  member.save();
  let roleRow = new ActivityRole(tuple([id, role]));
  roleRow.membership = id;
  roleRow.role = role;
  roleRow.save();
}
function accountFor(chainId: string, address: Address): Account {
  let native = address.toHexString();
  let id = tuple([chainId, native]);
  let account = Account.load(id);
  if (account == null) {
    account = new Account(id);
    account.chain = chainId;
    account.address = native;
    account.caip10 = chainId + ':' + native;
    account.addressFormat = 'eip155:lowercase-hex';
    account.visibility = 'PUBLIC';
    account.save();
  }
  return account;
}
function coverageFor(dataset: Dataset, asset: Asset, block: Block, kind: string): Coverage {
  let id = tuple([dataset.id, kind, asset.id]);
  let coverage = new Coverage(id);
  coverage.dataset = dataset.id;
  coverage.capability = kind;
  coverage.scope = asset.id;
  coverage.scopeDescription = dataset.methodology;
  coverage.availability = 'AVAILABLE';
  coverage.fromBlock = BigInt.fromString(dataSource.context().getString('startBlock'));
  coverage.throughBlock = block.id;
  coverage.save();
  return coverage;
}
function observe(event: Transfer, dataset: Dataset, coverage: Coverage, account: Account, asset: Asset, block: Block): void {
  let id = tuple([dataset.id, account.id, asset.id]);
  let observationId = tuple([id, block.id]);
  // eth_call from an event handler reads end-of-block state, not post-log state.
  // All observations for this holder in this block must therefore agree.
  let result = ERC20.bind(event.address).try_balanceOf(Address.fromString(account.address));
  let observation = new BalanceObservation(observationId);
  observation.holding = id;
  observation.block = block.id;
  observation.method = 'STATE_READ';
  if (result.reverted) {
    observation.availability = 'UNKNOWN';
    observation.reason = 'balanceOf reverted or was unavailable at this state block.';
  } else {
    observation.availability = 'AVAILABLE';
    observation.amount = result.value;
  }
  observation.save();
  let holding = new Holding(id);
  holding.account = account.id;
  holding.asset = asset.id;
  holding.coverage = coverage.id;
  holding.latest = observationId;
  holding.save();
}
function effect(event: Transfer, activity: Activity, account: Account, asset: Asset, kind: string): void {
  let row = new AssetEffect(tuple([activity.id, activity.sourceLocator, account.id, kind]));
  row.activity = activity.id;
  row.account = account.id;
  row.asset = asset.id;
  row.kind = kind;
  row.amount = event.params.value;
  row.sourceLocator = activity.sourceLocator;
  row.save();
}
export function handleTransfer(event: Transfer): void {
  let context = dataSource.context();
  let chainId = context.getString('chainId');
  let chain = Chain.load(chainId);
  if (chain == null) {
    chain = new Chain(chainId);
    chain.name = context.getString('chainName');
    chain.identifierStandard = 'CAIP-2';
    chain.ledgerModel = 'ACCOUNT';
    chain.save();
  }
  let datasetId = context.getString('datasetId');
  let dataset = Dataset.load(datasetId);
  if (dataset == null) {
    dataset = new Dataset(datasetId);
    dataset.chain = chainId;
    dataset.schemaVersion = '0.1.0';
    dataset.subgraphVersion = '0.1.0';
    dataset.methodologyVersion = '0.1.0';
    dataset.methodology = context.getString('methodology');
    dataset.save();
  }
  let blockId = tuple([chainId, event.block.hash.toHexString()]);
  let block = Block.load(blockId);
  if (block == null) {
    block = new Block(blockId);
    block.chain = chainId;
    block.hash = event.block.hash.toHexString();
    block.number = event.block.number;
    block.timestamp = event.block.timestamp;
    block.save();
  }
  let tokenAddress = event.address.toHexString();
  let assetId = tuple([chainId, 'erc20', tokenAddress, '']);
  let asset = Asset.load(assetId);
  if (asset == null) {
    asset = new Asset(assetId);
    asset.chain = chainId;
    asset.namespace = 'erc20';
    asset.reference = tokenAddress;
    asset.caip19 = chainId + '/erc20:' + tokenAddress;
    asset.kind = 'FUNGIBLE';
    // This adapter is restricted to the two verified Circle USDC deployments.
    asset.decimals = 6;
    asset.name = 'USD Coin';
    asset.symbol = 'USDC';
    asset.save();
  }
  let activities = coverageFor(dataset, asset, block, 'ACTIVITY');
  let holdings = coverageFor(dataset, asset, block, 'HOLDINGS');
  let txId = tuple([chainId, event.transaction.hash.toHexString()]);
  let tx = Transaction.load(txId);
  if (tx == null) {
    tx = new Transaction(txId);
    tx.block = blockId;
    tx.hash = event.transaction.hash.toHexString();
    tx.index = event.transaction.index;
    // A persisted Transfer log can only belong to a successful outer transaction.
    tx.status = 'SUCCESS';
    tx.save();
  }
  let locator = 'log:' + event.logIndex.toString();
  let activityId = tuple([txId, locator]);
  let action = new Activity(activityId);
  action.transaction = txId;
  action.coverage = activities.id;
  action.kind = 'TRANSFER';
  action.status = 'SUCCESS';
  action.sourceLocator = locator;
  action.timestamp = event.block.timestamp;
  action.sortKey = pad40(event.block.number) + ':' + pad40(event.transaction.index) + ':' + Bytes.fromUTF8(activityId).toHexString().slice(2);
  action.save();
  let zero = '0x0000000000000000000000000000000000000000';
  let from = event.params.from;
  let to = event.params.to;
  if (from.toHexString() != zero) {
    let sender = accountFor(chainId, from);
    membership(sender, action, 'SENDER');
    effect(event, action, sender, asset, to.toHexString() == zero ? 'BURN' : 'DEBIT');
    observe(event, dataset, holdings, sender, asset, block);
  }
  if (to.toHexString() != zero) {
    let recipient = accountFor(chainId, to);
    membership(recipient, action, 'RECIPIENT');
    effect(event, action, recipient, asset, from.toHexString() == zero ? 'MINT' : 'CREDIT');
    if (to.toHexString() != from.toHexString()) observe(event, dataset, holdings, recipient, asset, block);
  }
}
