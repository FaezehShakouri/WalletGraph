import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse, Kind, print } from 'graphql';
import { validateSchema } from '../node_modules/@graphprotocol/graph-cli/dist/validation/schema.js';
import Schema from '../node_modules/@graphprotocol/graph-cli/dist/schema.js';

const errors = validateSchema('schema.graphql').toJS();
assert.deepEqual(errors, [], 'The Graph schema validation failed');
const document = parse(await readFile('schema.graphql', 'utf8'));
const entities = document.definitions.filter(d => d.kind === Kind.OBJECT_TYPE_DEFINITION);
for (const entity of entities) {
  assert.ok(entity.description?.value, `${entity.name.value} needs a definition`);
  assert.equal(print(entity.fields.find(f => f.name.value === 'id').type), 'String!');
  for (const field of entity.fields) {
    assert.ok(field.description?.value, `${entity.name.value}.${field.name.value} needs documentation`);
    if (print(field.type).startsWith('[')) {
      assert.ok(field.directives.some(d => d.name.value === 'derivedFrom'), 'Growing arrays must be derived');
    }
  }
}
const schema = await Schema.load('schema.graphql');
const generator = schema.codeGenerator();
const generated = [...generator.generateModuleImports(), ...generator.generateTypes(),
  ...generator.generateDerivedLoaders()].map(x => x.toString()).join('\n\n');
await mkdir('generated', { recursive: true });
await writeFile('generated/schema.ts', generated);
console.log(`The Graph validation passed; ${entities.length} documented entities; AssemblyScript classes generated.`);
