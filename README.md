# WalletGraph

**A proposed standardized GraphQL schema for an address's portfolio and activity
across blockchains.** Version 0.1.0 is an experimental specification, ready for adapter
review rather than a claim of universal indexing or an adopted ecosystem standard.

The same structure describes holdings, actions, participants, positions and available
valuations while preserving differences in chain identity, ledger model and privacy.
An address is not assumed to identify an entire wallet or a person.

Start with [the schema](schema.graphql), then the [normative specification](docs/SPECIFICATION.md)
and [worked examples](docs/EXAMPLES.md). The [adapter guide](docs/IMPLEMENTING.md)
describes how to populate the schema. [Sources and design decisions](docs/SOURCES.md)
explain how The Graph and existing standards informed this proposal.

```sh
npm run check
```

Uses the already installed Graph CLI and Node test runner. `check` validates the schema
with The Graph's validator, generates and compiles AssemblyScript entity classes into `generated/`,
and runs schema, compiled-mapping and query-client tests. No API key or network is needed. The CLI
version is pinned in package.json; validation uses its internal module API, so upgrades
must be reviewed. `npm run validate:fixtures -- path/to/records.json` checks a dataset
export against the same subset of executable conformance rules. JSON format is an
object keyed by entity type, each containing an array of records with reference IDs.

## Contents

- `schema.graphql`: documented Graph-native entities and optional capability groups.
- `docs/SPECIFICATION.md`: IDs, units, accounting, coverage, privacy, pagination and versioning.
- `examples/queries.graphql`: queries intended for a deployed Graph Node endpoint.
- `scripts/`: structural validation, entity generation and semantic validator.
- `test/`: synthetic chain examples and rejection tests.

The existing `query-standard-subgraphs.js` demo and `npm start` are preserved. They
query existing DeFi subgraphs and are not WalletGraph's reference implementation.

## What remains for a live hackathon submission

The schema now has a [USDC reference adapter](docs/REFERENCE-ADAPTER.md) for Ethereum
and Base. Both Graph subgraphs compile; the production mapping is tested against
captured live RPC events and balances. The same query client serves both networks.

```sh
npm run build:adapter
# Configure ignored .env from .env.example, then:
npm run deploy -- ethereum
npm run deploy -- base
npm run verify:live -- ethereum
npm run verify:live -- base
```

**Still pending:** Studio credentials/slugs, provider deployment and live Graph-query
verification, actual Graph Node fork testing, your repository push, and the
[demo recording](docs/DEMO.md). Captured RPC evidence is not a live Graph-provider
integration. Bitcoin/Zcash examples remain schema fixtures, not live adapters.

The Graph's [ETHOnline standardized-products prize](https://ethglobal.com/events/ethonline2026/prizes/the-graph)
requires live provider data, meaningful standardization, a public repository and a
2–4 minute demo. A specification with synthetic tests alone is not a complete entry.
See [event rules](https://ethglobal.com/events/ethonline2026/info/details) for track,
source-history and AI-attribution requirements. This draft and its tests were created
with Codex assistance; team review and chain-specific implementation remain necessary.
