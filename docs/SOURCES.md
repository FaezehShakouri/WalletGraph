# Source review and design decisions

Reviewed 2026-09-12. Sources inform the design; WalletGraph is not officially endorsed.

| Primary source | Decision |
| --- | --- |
| [The Graph: GraphQL schema](https://thegraph.com/docs/en/subgraphs/developing/creating/ql-schema/) | Entity-based query model, required IDs, immutable history, derived reverse relationships, supported scalars |
| [The Graph: manifest](https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/) | Separate schema from ingestion; one network per subgraph; no assumption of universal trace support |
| [Standardized subgraphs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/) | Consistent semantics across implementations and extension rules |
| [Messari conventions](https://github.com/messari/subgraphs/blob/master/docs/SCHEMA.md) | Base-unit integers, nullable inapplicable fields, three version dimensions |
| [Messari generic schema](https://github.com/messari/subgraphs/blob/master/schema-generic.graphql) | Study shared metadata and snapshots; do not copy protocol TVL/revenue or Ethereum-only Account identity into the address core |
| [CAIP-2](https://standards.chainagnostic.org/CAIPs/caip-2) | Chain identity instead of a permanently expanding network enum |
| [CAIP-10](https://standards.chainagnostic.org/CAIPs/caip-10) | Optional interoperable address alias with namespace-specific canonicalization; length constraints preclude universal mandatory use |
| [CAIP-19](https://standards.chainagnostic.org/CAIPs/caip-19) | Optional asset identity alias; native assets and individual token identities |
| [Bitcoin transactions](https://developer.bitcoin.org/devguide/transactions.html) | Preserve inputs/outpoints/outputs; no universal sender-to-recipient pair |
| [Zcash ZIP-316](https://zips.z.cash/zip-0316) | Unified address and viewing scope differences; never promise public discovery of shielded holdings |

Intentional departures from the studied generic schema: string tuple IDs instead of
fixed address bytes, nullable unknown decimals rather than a default, Chain records
instead of a network enum, and no forced financial metrics on Account. Reverse
collections are derived, including many-to-many activity membership. Optional
capabilities retain the same complete GraphQL schema across deployments.

This draft does not reuse source schema text. Entity/field descriptions and accounting
contracts are written for WalletGraph. Future integrations should document their own
contract ABIs, chain profiles and deployment references separately.
