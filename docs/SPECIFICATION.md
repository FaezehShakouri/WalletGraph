# WalletGraph specification

Version: **0.1.0 — experimental proposal**. Normative schema: `../schema.graphql`.
This is an original address-data standard informed by The Graph and Messari conventions,
not an adopted standard, a fork of a DEX schema, or a claim of universal live coverage.
MUST, MUST NOT, SHOULD and MAY are normative requirements for implementations.

## Purpose and boundaries

Given a **network and address**, consumers use the same entity definitions to read
available holdings, protocol positions and included on-chain activity. A wallet may
manage many addresses; this standard does not infer common ownership. `Account`
means an address subject, including on UTXO networks, not an account-ledger assumption.
A missing account response means **not indexed**, not an empty wallet.

The Graph storage schema is the deliverable. Graph Node generates query root fields;
there is no custom `Query`, HTTP resolver, or cross-chain discovery service in this package.
One reference deployment MUST represent one Dataset on one Chain. Multiple deployments
can use the same schema; a separate consumer can federate their responses. Non-EVM
schema representation does not establish that The Graph can ingest that network.
The USDC reference adapter now implements Ethereum/Base ingestion; see
REFERENCE-ADAPTER.md. A provider deployment has not yet been verified.

## Consumer questions

1. What observed balances exist for this address, at which blocks and with what certainty?
2. Which included activities involve it, with which roles and asset effects?
3. Which claims and liabilities are attributable to it?
4. What portion of that portfolio is priced, under which accounting rules?
5. Which sources and block intervals were examined, and what was unavailable?

## Core and capability contracts

Every deployment MUST expose all schema types, exactly as defined. A capability decides
which records it can populate; it does not remove fields/types from the query schema.
Core entities: Chain, Dataset, Coverage, Account, Asset, Block. Implementations MUST
publish at least one Coverage entry. Other entity groups are optional:

| Capability | Entity group | Minimum semantics |
| --- | --- | --- |
| ACTIVITY | Transaction, Activity, AccountActivity, ActivityRole, AssetEffect | Included actions, membership, stable evidence and ordering; effects may be incomplete only when scope says so |
| HOLDINGS | Holding, BalanceObservation | Exact or explicitly qualified balance at a state block |
| POSITIONS | Protocol, Position, PositionComponent | Owned claims and debts with complete/current component set or explicit incompleteness |
| VALUATION | PortfolioValuation, ValuationItem | Auditable, disjoint exposures with partial-price handling |
| UTXO | Transaction, TransactionInput, TransactionOutput | Source input/output structure without guessed payment pairings |

Availability is always relative to a documented **scope**. AVAILABLE means the named
capability meets its contract for that scope and interval; it never means all assets
on a chain. Scope descriptions MUST enumerate addresses/contracts/asset rules and
excluded event kinds, as well as provide an adapter refresh policy. PARTIAL requires
a reason and lists gaps. PRIVATE means unavailable under public access; UNSUPPORTED
means not implemented; UNKNOWN means not established. Absence of a capability is
unsupported. Coverage with PRIVATE/UNSUPPORTED/UNKNOWN MUST NOT claim a contiguous
interval. An available/partial scope MUST specify fromBlock and throughBlock and
fromBlock <= throughBlock.number. throughBlock is a per-scope watermark, not the
block of the last matching event. For an event-only adapter unable to advance a
watermark at empty blocks, retain a conservative watermark. Graph `_meta` is the
provider sync head; it does not establish asset completeness or finality.

## Identity and normalization

IDs are strings deliberately: a 20-byte EVM address cannot represent arbitrary
chain addresses, scripts or long Zcash unified addresses. Never use ticker symbols,
display names, JavaScript Number values, or query result order as identity.

Chain.id SHOULD use CAIP-2 when the namespace profile is defined. An unsupported
namespace MUST use an explicitly experimental implementation-owned URI with
identifierStandard set to its documentation URI; do not claim it is CAIP-2.
`caip10` and `caip19` are optional interoperability aliases. Do not truncate an
address to fit CAIP-10's length bound or invent a CAIP namespace. An example fixture
with `example:zcash` is explicitly synthetic, not a registered Zcash identifier.

All composite IDs use this unambiguous tuple codec:
`tuple(p1,...,pn) = decimal_UTF8_byte_length(p1) + ':' + p1 + ...`.
Parts MUST be nonempty except the documented optional token ID part. Strings MUST
contain no U+0000 and no unpaired UTF-16 surrogates. This is a WalletGraph ID format,
not a claim to be CAIP-10. Fields expose readable native addresses and CAIP aliases.
The tuple recipes are documented on every entity's id field in schema.graphql.
A stable source key means the same evidence produces the same ID on every replay.

Network profiles MUST define parsing, checksum validation, canonicalization and
hash encoding. EVM addresses MUST be validated by the adapter and then lowercase
hex in `address`; a checksum display form belongs in a UI. Case-sensitive address
formats MUST preserve case. Bech32 variants MUST follow their native canonical rules.
Byte-for-byte matching across chains does not establish ownership.

## Amounts, metadata and time

All quantities are nonnegative BigInt in the asset's smallest unit. Sign is expressed
through AssetEffect.kind or PositionComponent.role. Use no IEEE-754 Number conversion.
Decimals are nullable Int in [0,1000] in v0.1 to bound arithmetic; never assume 18. NFT quantities are integer
counts with decimals 0 when established. Each individual NFT/multi-token item has
its tokenId in identity; token symbols are untrusted metadata. Native assets have
namespace native and a documented reference, not a fake zero-address contract.

All timestamps are Unix **seconds** in BigInt, not Graph Timestamp microseconds.
Unknown timestamps are null. Heights and indices are nonnegative BigInt. A chain
profile defines whether Block.number denotes a height or slot. Metadata, holdings,
coverage and positions are mutable; included transactions/actions and observations
are immutable. Immutable entities may be assembled within their creation block;
adapters MUST NOT plan later-block corrections to them. Reinterpretation requires
a reindex/version change. Forked state MUST be rolled back. External consumers MUST
invalidate orphaned block hashes and not assume included means finalized.

## Activity and attribution

Transaction contains no universal from/to pair. Activity identifies a source-defined
action within that transaction. Multiple actions may occur in a batch. UNKNOWN is
preferred to guessing a classification. OTHER requires customKind; all other kinds
require null customKind. Protocol attribution is optional and must be evidenced.

AccountActivity is unique per (account,activity), even for self-transfers. Roles are
separate records so sender/recipient/beneficiary/operator need not be the same address.
Do not treat transaction initiator or router as economic owner without evidence.

AssetEffect is an observed address-relative base-unit change. DEBIT/FEE/BURN subtract;
CREDIT/MINT add. A self-transfer can have a debit and a credit with zero net effect.
Fee payer can differ from initiator. A fee MUST NOT also be emitted as a duplicate
DEBIT. Mint/burn endpoints are not fabricated owner accounts. Failed actions MUST
NOT carry successful asset movements; a known charged fee can remain. A successful
transaction can contain a failed action. Event-only adapters MUST declare that fully
reverted transactions are outside their observable scope, not report zero failures.

An effect is assigned to one canonical Activity. A swap MAY contain observed transfer
effects, but MUST NOT additionally emit independent transfer activities that duplicate
the same effects. Activity feeds count unique memberships, not roles or effects.
For route/batch summaries add a namespaced extension rather than duplicate money.
UTXO source rows and activity effects are different views; never add them together.
No UTXO input-to-output ownership, change-address heuristic or sender/recipient
pairing is inferred by the core.

Activity.sortKey = pad40(block.number) + ':' +
pad40(transaction.index when known, otherwise 0) + ':' + hex(UTF8(activity.id)).
Values >= 10^40 are outside v0.1 ordering support and MUST fail explicitly.
This is deterministic, not a claim of execution order when transaction.index is
unknown. AccountActivity.sortKey MUST equal it. Page with sortKey_gt and orderBy:
sortKey, orderDirection: asc, at a pinned block. For reverse feeds use lt/desc.
One deployment's block anchor does not synchronize different chains.

## Balances and history

Holding.latest points to its latest end-of-block BalanceObservation. Each observation
belongs to that holding and the same chain. AVAILABLE requires an amount and an
exact method (STATE_READ, COMPLETE_REPLAY or AUTHORIZED_VIEW). PARTIAL_REPLAY MUST
NOT be labeled AVAILABLE. Transfer deltas since a recent start block are not a
balance: record amount null/UNKNOWN unless a defensible estimate exists. PRIVATE,
UNSUPPORTED and UNKNOWN require null amount and a reason; PARTIAL requires a reason.

A complete replay requires complete initial state and all relevant state changes.
Rebasing tokens, interest, protocol accrual and tokens with atypical logs need explicit
state reads or correct accounting. Missing events cannot prove unchanged balances.
Observation time is state time, not when the observer happened to fetch data.
Holding observations provide history without pretending daily samples exist.
UTXO balances require known unspent outputs and the chosen confirmation policy,
including outputs predating the activity scope. No negative balances are accepted.

## Positions and accounting

Position ownership must follow protocol evidence, including share/position transfers.
Components may contain multiple assets and liabilities. They share Position.observedAt;
updates MUST remove stale components. componentsComplete cannot be true when a
component is unavailable or omitted. CLOSED does not follow from missing data.
Interest-bearing quantities need a documented refresh/calculation method.

Do not sum every Holding plus every Position: a receipt token and the underlying
claim may represent the same economic exposure. VALUATION implementations MUST
publish a deterministic selection/exclusion algorithm and assign exposureKey to
its disjoint selected exposures. Select either the receipt token or its underlying
components, never both. Unrecognized overlap makes the valuation PARTIAL.
No universal net-worth scalar is stored on Account.

ValuationItem copies amount and decimals at PortfolioValuation.block. It references
source evidence as a string so future changes to mutable positions cannot change
historical valuation arithmetic. Prices MUST carry source and observation timestamp,
not newer than the state block timestamp. The methodology MUST define maximum price
age, liquidity/source selection, stablecoin treatment and an asset identification
policy. Missing state timestamps or unestablished price freshness prevent AVAILABLE.
Round item USD values to 18 fractional digits, half up; sum those rounded values.
Graph BigDecimal has 34 significant digits, so implementations MUST reject or mark
unavailable inputs/results that cannot meet this convention rather than silently
lose integer precision. Zero is valid only for an established zero amount or price.

pricedAssetsUSD/pricedLiabilitiesUSD are sums of priced selected items, or null when
that side has only unpriced items. A demonstrably empty side is 0.
unpricedCount counts items with null valueUSD. An AVAILABLE valuation requires
complete scope, known quantities and prices, no overlap, and zero unpricedCount;
netValueUSD = pricedAssetsUSD - pricedLiabilitiesUSD. Otherwise netValueUSD is null.
A PARTIAL priced subtotal MUST NOT be presented to users as complete net worth.

## Privacy and ledger-specific extensions

A shielded address alone cannot reveal balances or participants. Represent its
visibility and unavailable records; do not guess hidden values or identify anonymous
participants. A unified address may be MIXED; it is not one Ethereum-style account.
Long native addresses are preserved even when no CAIP-10 alias fits.
Authorized-view records belong only in an access-controlled implementation. Never
store viewing/spending keys, secrets, decrypted private history or user wallet
clusters in a public subgraph. Public deployment coverage is public-only.

UTXO TransactionOutput supports an address, public script, shielded endpoint or
unknown endpoint. ADDRESS requires account; other kinds require null account.
SCRIPT requires script. Null amount is unknown/private, never zero. A non-coinbase
input retains its source outpoint even if the earlier output is outside coverage.
Coinbase has no previous outpoint. Resolved outpoints must match hash/index and chain;
only one canonical spend may reference a given output. The shielded-note/nullifier
model is intentionally not implemented by the UTXO extension; a future reviewed
extension is required for that detail.

## Extensibility and versioning

Namespaced extension entities MAY reference core records; MUST NOT redefine their
meaning. Adding a chain normally needs a profile and adapter, not a Chain enum entry.
No custom scalar is required. CapabilityKind is intentionally a closed v0.1 set;
adding a new capability requires a versioned schema release.
Schema, implementation and methodology versions are separate semantic versions.
For 0.x, any semantic breaking change increments minor; corrections without changed
meaning increment patch. Once 1.0, breaking changes increment major. Enum additions
are treated as breaking for exhaustive consumers. Freeze no 1.0 until independent
adapter implementations and consumer feedback demonstrate compatibility.

## Conformance and limits

`npm run check` invokes The Graph's installed schema validator and code generator,
checks documented fields/derived relationships, and runs positive and negative
semantic fixtures. These are schema contract tests, **not live integration tests**.
An adapter MUST additionally prove source completeness, canonical address validation,
refresh behavior, fork rollback, ownership attribution and source-to-entity correctness
with its own chain-specific tests. Shape validation alone cannot establish those facts.

See `EXAMPLES.md` for worked cases, `SOURCES.md` for research and design decisions,
and `../examples/queries.graphql` for Graph Node consumer queries.
