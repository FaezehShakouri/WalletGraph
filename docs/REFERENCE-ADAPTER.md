# USDC reference adapter: Ethereum and Base

The first executable implementation preserves `schema.graphql` unchanged. It exposes
the same ACTIVITY and HOLDINGS shapes for Circle-issued USDC on two EVM networks.
This proves reuse across these two networks, not universal protocol/chain support.

| Network | Chain ID | USDC contract | Manifest |
| --- | --- | --- | --- |
| Ethereum | eip155:1 | 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 | subgraphs/evm/ethereum.yaml |
| Base | eip155:8453 | 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 | subgraphs/evm/base.yaml |

Contract addresses were verified against [Circle's deployment list](https://developers.circle.com/stablecoins/usdc-contract-addresses)
and live RPC code/decimals reads. Each manifest starts at the finalized block recorded
in its committed evidence file; this intentionally excludes earlier history. Run
`npm run capture:live` then `npm run configure:adapter` to choose fresh evidence and
start blocks. Review and commit such changes before deploying a new version.

## What the implementation observes

- Every persisted Transfer log from the configured token after startBlock creates
  one TRANSFER activity, with the log index as source locator. It does not interpret
  the broader transaction as a swap, deposit, bridge transfer or protocol position.
- Nonzero endpoints become accounts with sender/recipient roles. A self-transfer
  produces one membership, two roles, and equal debit/credit effects. The zero address
  marks mint/burn semantics and is never attributed as an owner.
- `balanceOf` reads end-of-block state for the involved addresses, even when indexing
  begins late in the token's history. It does not sum recent transfers into a balance.
  Reverted calls yield UNKNOWN/null observations. Other RPC failures may halt Graph
  indexing; the query client rejects endpoints reporting indexing errors.
- Holdings refresh only when an address participates in another Transfer event.
  Latest means last observed, not guaranteed current at chain head. No guarantee is
  made for dormant or never-observed addresses or non-log balance mutations.
- The coverage scope is token Transfer activity and these participant observations.
  The watermark advances on matching event blocks only; it is conservatively stale
  during empty blocks. `_meta` reports the separate provider synchronization head.
- No native ETH holdings, gas fees, reverted transaction history, approvals, NFT
  positions, prices or protocol-specific holdings are supplied. Missing capabilities
  remain unsupported. USDC is not hard-coded as a one-dollar valuation.

The manifest embeds a public self-contained `data:text/plain` methodology reference,
so its coverage rules are available before a GitHub remote exists. Dataset IDs are
stable per network. Build artifacts, credentials and generated classes are ignored.

## Commands

Requires Node 24 and the locked npm dependencies. After a fresh checkout run `npm ci`.

```sh
npm run check
cp .env.example .env
```

In Subgraph Studio, create two subgraphs on the matching networks. Put the deploy key,
slugs and later the Studio query URLs in `.env`; do not commit that file. Authentication
and publication costs, if any, remain under the user's Studio account. Deployment here
means Studio deployment, not a separate on-chain publication transaction.

```sh
npm run deploy -- ethereum
npm run deploy -- base
# After indexing has reached the evidence blocks and query URLs are configured:
npm run verify:live -- ethereum
npm run verify:live -- base
npm run query:wallet -- ethereum 0xYOUR_ADDRESS
npm run query:wallet -- base 0xYOUR_ADDRESS
```

`query:wallet` uses the same GraphQL operations for both networks. It validates address
encoding/checksum, checks chain/schema identity and indexing status, pages collections
at one indexed block, and checks for an anchor hash change before returning. A missing
account returns NOT_INDEXED, not a zero-balance assertion. Provider errors fail explicitly;
there is no mock fallback. Query URL and deployment key are not printed by our wrappers.

`verify:live` requires an actual Graph-provider query endpoint. It checks a captured
source transfer against the indexed activity/effect, then compares a current indexed
balance observation with block-pinned RPC `balanceOf`. Reports go to ignored
`artifacts/live-verification-NETWORK.json`. It does not create a success report if no
provider is configured. Public RPCs may rate-limit or lack historical state; authenticated
archive-capable RPC URLs can be supplied in `.env`.

## What was verified locally

The committed files under `test/evm/evidence/` contain actual public RPC captures,
including capture timestamps, finalized block hashes, receipts and end-of-block balances.
They are historical evidence, not generated wallet examples or current portfolio values.
The test-only AssemblyScript harness imports the production mapping unchanged and
executes its compiled WASM with a minimal deterministic Graph host. It supplies captured
balanceOf results, verifies actual emitted entities with the schema validator, and
compares quantities to the source evidence. Synthetic mutations add edge cases.

Replay idempotence and restoration of a host-store checkpoint are tested. This tests
mapping behavior under rollback, **not Graph Node's actual fork detection/rollback**.
No live Graph Node reorganization test is claimed. Both production Graph builds are
also checked separately from the test harness. The client has mocked-provider tests
for pagination, error propagation, chain mismatches and an anchor change.

## Remaining externally dependent checks

1. Configure Studio credentials/slugs and deploy both manifests.
2. Wait for synchronization and run both live verification commands.
3. Verify fork behavior against a controlled Graph Node dev chain if claiming live
   reorganization support; the local store rollback test alone is insufficient.
4. Push the public repository (the user is handling the push), and record the demo.

The schema and mapping package can be reviewed now. These pending checks must not be
represented as completed in a submission or demo.
