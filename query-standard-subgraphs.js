/**
 * Standardized Subgraphs demo (Messari schemas on The Graph).
 *
 * Same GraphQL works across every protocol of a given type (DEX, lending, …).
 * Docs: https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/
 *
 * Get a free API key: https://thegraph.com/studio/apikeys/
 * Then: GRAPH_API_KEY=your_key node query-standard-subgraphs.js
 */

const API_KEY = process.env.GRAPH_API_KEY;

if (!API_KEY) {
  console.error("Set GRAPH_API_KEY (https://thegraph.com/studio/apikeys/)");
  process.exit(1);
}

const gateway = (subgraphId) =>
  `https://gateway.thegraph.com/api/${API_KEY}/subgraphs/id/${subgraphId}`;

// Messari deployments: https://github.com/messari/subgraphs/blob/master/deployment/deployment.json
const DEX_SUBGRAPHS = [
  {
    name: "Uniswap V3 (Ethereum)",
    schema: "DEX AMM Extended",
    id: "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6",
  },
  {
    name: "SushiSwap (Ethereum)",
    schema: "DEX AMM",
    id: "77jZ9KWeyi3CJ96zkkj5s1CojKPHt6XJKjLFzsDCd8Fd",
  },
];

const LENDING_SUBGRAPHS = [
  {
    name: "Aave V3 (Ethereum)",
    schema: "Lending / CDP",
    id: "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk",
  },
];

const DEX_QUERY = `
  query DexStandard {
    protocols(first: 1) {
      name
      slug
      schemaVersion
      subgraphVersion
      methodologyVersion
      totalValueLockedUSD
      cumulativeVolumeUSD
      cumulativeTotalRevenueUSD
      cumulativeSupplySideRevenueUSD
      cumulativeProtocolSideRevenueUSD
    }
    financialsDailySnapshots(first: 3, orderBy: timestamp, orderDirection: desc) {
      timestamp
      totalValueLockedUSD
      dailyVolumeUSD
      dailyTotalRevenueUSD
      dailySupplySideRevenueUSD
      dailyProtocolSideRevenueUSD
    }
    liquidityPools(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      name
      totalValueLockedUSD
      cumulativeVolumeUSD
      inputTokens { symbol }
    }
  }
`;

const LENDING_QUERY = `
  query LendingStandard {
    protocols(first: 1) {
      name
      slug
      schemaVersion
      totalValueLockedUSD
      cumulativeTotalRevenueUSD
    }
    markets(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
      name
      inputToken { symbol }
      totalValueLockedUSD
      totalDepositBalanceUSD
      totalBorrowBalanceUSD
      inputTokenPriceUSD
    }
  }
`;

async function querySubgraph({ name, schema, id }, query) {
  const res = await fetch(gateway(id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    return { name, schema, error: json.errors ?? json };
  }
  return { name, schema, data: json.data };
}

function usd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function printDex(result) {
  console.log(`\n=== ${result.name}  [${result.schema}] ===`);
  if (result.error) {
    console.log(JSON.stringify(result.error, null, 2));
    return;
  }
  const proto = result.data.protocols?.[0];
  if (proto) {
    console.log(
      `${proto.name}  schema ${proto.schemaVersion}  methodology ${proto.methodologyVersion}`
    );
    console.log(
      `TVL ${usd(proto.totalValueLockedUSD)}  volume ${usd(proto.cumulativeVolumeUSD)}`
    );
    console.log(
      `revenue total ${usd(proto.cumulativeTotalRevenueUSD)}  ` +
        `supply-side ${usd(proto.cumulativeSupplySideRevenueUSD)}  ` +
        `protocol ${usd(proto.cumulativeProtocolSideRevenueUSD)}`
    );
  }
  console.log("Recent daily snapshots:");
  for (const s of result.data.financialsDailySnapshots ?? []) {
    const day = new Date(Number(s.timestamp) * 1000).toISOString().slice(0, 10);
    console.log(
      `  ${day}  TVL ${usd(s.totalValueLockedUSD)}  vol ${usd(s.dailyVolumeUSD)}  fees ${usd(s.dailyTotalRevenueUSD)}`
    );
  }
  console.log("Top pools:");
  for (const p of result.data.liquidityPools ?? []) {
    const pair = (p.inputTokens ?? []).map((t) => t.symbol).join("/");
    console.log(`  ${p.name ?? pair}  TVL ${usd(p.totalValueLockedUSD)}`);
  }
}

function printLending(result) {
  console.log(`\n=== ${result.name}  [${result.schema}] ===`);
  if (result.error) {
    console.log(JSON.stringify(result.error, null, 2));
    return;
  }
  const proto = result.data.protocols?.[0];
  if (proto) {
    console.log(`${proto.name}  schema ${proto.schemaVersion}  TVL ${usd(proto.totalValueLockedUSD)}`);
  }
  console.log("Top markets:");
  for (const m of result.data.markets ?? []) {
    console.log(
      `  ${m.name}  TVL ${usd(m.totalValueLockedUSD)}  ` +
        `deposits ${usd(m.totalDepositBalanceUSD)}  borrows ${usd(m.totalBorrowBalanceUSD)}`
    );
  }
}

const [dexResults, lendingResults] = await Promise.all([
  Promise.all(DEX_SUBGRAPHS.map((sg) => querySubgraph(sg, DEX_QUERY))),
  Promise.all(LENDING_SUBGRAPHS.map((sg) => querySubgraph(sg, LENDING_QUERY))),
]);

console.log("Same DEX query against two protocols (standardized schema).");
for (const r of dexResults) printDex(r);

console.log("\nLending schema uses Market instead of LiquidityPool, same Protocol backbone.");
for (const r of lendingResults) printLending(r);
