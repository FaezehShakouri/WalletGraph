import './env.mjs';
import { spawn } from 'node:child_process';
import { networks } from './networks.mjs';
const name = process.argv[2];
if (!networks[name]) throw new Error('Usage: npm run deploy -- ethereum|base [studio-slug]');
const slug = process.argv[3] || process.env[`${name.toUpperCase()}_SUBGRAPH_SLUG`];
const key = process.env.GRAPH_DEPLOY_KEY;
if (!slug || !key) {
  console.error(`Deployment needs GRAPH_DEPLOY_KEY and ${name.toUpperCase()}_SUBGRAPH_SLUG in ignored .env (or provide the slug as an argument). No upload attempted.`);
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Studio slug must use lowercase letters, digits and hyphens');
const args = ['node_modules/@graphprotocol/graph-cli/bin/run.js','deploy',slug,`subgraphs/evm/${name}.yaml`,
  '--node','https://api.studio.thegraph.com/deploy/','--version-label',process.env.SUBGRAPH_VERSION || 'v0.1.0',
  '--output-dir',`build/${name}`,'--deploy-key',key];
console.log(`Deploying ${name} to Studio slug ${slug}; credentials withheld.`);
const child = spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});
let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
child.on('error', () => { console.error('Could not start Graph CLI'); process.exitCode=1; });
child.on('close', code => { console.log(output.replaceAll(key,'[REDACTED]')); process.exitCode=code ?? 1; });
