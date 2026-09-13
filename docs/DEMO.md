# Live demo outline (2–4 minutes)

Record this only after actual Studio endpoints pass `verify:live`. Do not substitute
synthetic fixture output for a live-provider demonstration.

1. Explain the problem: different chain data sources require different wallet data
   integrations; WalletGraph defines shared meanings and makes data coverage explicit.
2. Open schema.graphql: show Account, AccountActivity, Holding.latest and Coverage.
   Explain that the schema is the principal reusable contribution.
3. Query an address from the Ethereum evidence using `query:wallet`. Show the source
   transaction and exact base-unit quantity. Explain latest balance observation time.
4. Run the same command for Base with a Base evidence address. Show that the client
   queries and GraphQL entity fields are unchanged; only the network/endpoint changes.
5. Show the test summary and the live-verification reports. Distinguish source-backed
   adapter checks from the schema's synthetic Bitcoin/Zcash representation examples.
6. State limitations: USDC-only live coverage, public data, observations refreshed on
   transfers, no universal wallet discovery. Show how another adapter implements the
   same documented capability contract.

Use real endpoint responses and narrate personally. Include the public repository,
source/AI attribution and a truthful account of pre-existing work in the submission.
The Git history was initialized after the schema draft existed; its commits organize
that existing work and do not purport to reconstruct earlier development timestamps.
