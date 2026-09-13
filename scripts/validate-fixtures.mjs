import { readFile } from 'node:fs/promises';
import { validateRecords } from './conformance.mjs';
if (!process.argv[2]) throw new Error('Usage: npm run validate:fixtures -- records.json');
const errors = validateRecords(JSON.parse(await readFile(process.argv[2], 'utf8')));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Executable conformance checks passed (not a live-source completeness certificate).');
