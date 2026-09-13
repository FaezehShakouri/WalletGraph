# Worked cases

These are synthetic contract examples, not live chain results. Executable fixtures
are in `test/fixtures.mjs`; their invariants are tested in `test/conformance.test.mjs`.

| Case | Required representation | Error avoided |
| --- | --- | --- |
| Ethereum self-transfer | One activity membership with SENDER and RECIPIENT roles; separate equal DEBIT/CREDIT effects | Duplicate feed rows and false spending |
| Bitcoin multi-input payment | Source outputs and spending inputs; no asserted input-to-recipient mapping | Treating UTXO transactions as an Ethereum from/to transfer |
| Zcash shielded address | Address preserved; PRIVATE balance, null amount, explicit reason | Presenting hidden balance as zero |
| Recent partial indexing | UNKNOWN balance or defensible PARTIAL estimate, never exact transfer sum | Incorrect balance from incomplete history |
| Failed action with charged gas | FAILURE action with FEE effect only | Inventing successful transfers on failure |
| Lending | Separate ASSET and LIABILITY components | Treating borrowed value as net wealth |
| Receipt token and underlying | One economic exposure selected by valuation methodology | Double-counting an investment |
| Unpriced debt | Partial valuation with null netValueUSD | Overstated net worth from omitted debt |
| Same textual address on two chains | Different account IDs | Merging identities across chains |
| Unknown asset decimals | null, while base-unit amount remains exact | Defaulting every asset to 18 decimals |

A schema example does not prove source support. In particular the synthetic Zcash
chain profile does not claim a registered chain ID, public shielded visibility or a
working Zcash subgraph. The fixtures test representation, not cryptographic address
validity; real adapters MUST use the native address decoder.
