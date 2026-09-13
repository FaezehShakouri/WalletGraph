# Implementing WalletGraph

An adapter conforms by producing the standard entities with their defined meanings.
It need not index every address, asset or capability. It must declare what it does.

## Implementation sequence

1. Select one network and document its native address/hash normalization profile.
   Use a real registered CAIP chain ID when supported; never copy the synthetic IDs
   from fixtures into a live deployment.
2. Create one Dataset with implementation and methodology versions. Declare each
   capability's source allowlist, start state, history limits and refresh policy.
3. Use the unmodified schema.graphql. In a Graph subgraph, add the chain-specific
   manifest, ABIs and mappings; the generated classes are available from codegen.
4. Normalize identities and store base-unit integers. Build block/transaction
   references before saving dependent actions, effects and observations. Derived
   arrays are not mapping write targets. Immutable child records can be assembled
   in the same block, but cannot be enriched in future blocks.
5. Emit one account membership per action, with as many evidenced role rows as needed.
   Use source locators whose values can be reproduced independently on reindex.
6. Add exact balance observation support only when initial state and subsequent
   changes are correct for that asset. Otherwise declare limited activity coverage.
7. Test real source records, including self-transfers, fee sponsorship, batches,
   reverts, out-of-range history and a fork rollback. Use the exported-dataset
   validator to catch schema-level mistakes, plus chain-native validation tools.
8. Deploy, compare selected records to native chain evidence, and demonstrate the
   unchanged consumer queries. Pin pagination to a common indexed block per query.

## Cross-chain consumption

Ethereum and Bitcoin can share this schema while using different source adapters.
An EVM Solidity event mapping cannot simply read Bitcoin inputs or Zcash notes.
Verify ingestion support and provider APIs for each network independently. A federating
service can query compatible deployments and route requests by Chain.id; that service
is separate from this Graph storage schema. Never concatenate deployments' records
without resolving overlap, version compatibility and independent block anchors.

## Review before declaring version 1.0

- Two independent implementations pass the same capability contract.
- The same consumer queries run against each deployment without protocol branches.
- Namespace profiles and complete/partial meanings are reproducible.
- A reviewer can trace every derived quantity to evidence and methodology.
- No implementation needs to change a core field's meaning for its chain.
- Live historical queries and fork behavior have been verified.

For the hackathon, the smallest credible next step is a real adapter plus a second
source demonstrating reuse, a live query demo and a clear explanation of the standard's
benefit. This package intentionally does not claim that the above live checks passed.
