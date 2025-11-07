#!/usr/bin/env node
// Writes the configuration tables of the package READMEs from the zod schemas, so docs cannot drift.
//   node scripts/gen-config-docs.mjs          update the READMEs
//   node scripts/gen-config-docs.mjs --check  fail if a README is out of date (used in CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const targets = [
  { pkg: 'annotator', schema: 'AnnotatorConfig' },
  { pkg: 'maps', schema: 'MapsConfig' },
];

const START = '<!-- config:start -->';
const END = '<!-- config:end -->';

function typeOf(node) {
  if (node.enum) {
    const all = node.enum.map((v) => JSON.stringify(v));
    return all.length > 6
      ? `${all.slice(0, 3).join(' | ')} | … (${all.length} values)`
      : all.join(' | ');
  }
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (node.anyOf) return node.anyOf.map(typeOf).join(' | ');
  if (node.oneOf) return node.oneOf.map(typeOf).join(' | ');
  if (node.prefixItems) return `[${node.prefixItems.map(typeOf).join(', ')}]`;
  if (node.properties?.type?.const !== undefined)
    return `{ type: ${JSON.stringify(node.properties.type.const)}, … }`;
  if (node.type === 'array') {
    const item = node.items ? typeOf(node.items) : 'unknown';
    return item.includes(' ') ? `Array<${item}>` : `${item}[]`;
  }
  if (node.type === 'object' && !node.properties) return 'object';
  return node.type ?? 'unknown';
}

function show(value) {
  if (value === undefined) return '–';
  const text = JSON.stringify(value);
  return `\`${text.length > 60 ? `${text.slice(0, 57)}…` : text}\``;
}

function rows(schema, prefix = '') {
  const out = [];
  for (const [key, node] of Object.entries(schema.properties ?? {})) {
    if (key === 'enabled') continue;
    const path = `${prefix}${key}`;
    if (node.type === 'object' && node.properties) {
      out.push({ path, type: 'object', def: node.default, description: node.description ?? '' });
      out.push(...rows(node, `${path}.`));
    } else {
      out.push({
        path,
        type: typeOf(node),
        def: node.default,
        description: node.description ?? '',
      });
    }
  }
  return out;
}

function table(schema) {
  const lines = ['| Option | Type | Default | Description |', '|---|---|---|---|'];
  for (const r of rows(schema)) {
    const desc = r.description.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const type = r.type.replace(/\|/g, '\\|');
    const def = show(r.def).replace(/\|/g, '\\|');
    lines.push(`| \`${r.path}\` | \`${type}\` | ${def} | ${desc} |`);
  }
  return lines.join('\n');
}

let stale = false;
for (const { pkg, schema } of targets) {
  const require = createRequire(join(root, 'packages', pkg, 'package.json'));
  const { toJSONSchema } = await import(pathToFileURL(require.resolve('zod')).href);
  const mod = await import(pathToFileURL(join(root, 'packages', pkg, 'dist', 'index.js')).href);
  const json = toJSONSchema(mod[schema], { io: 'input', unrepresentable: 'any' });
  const file = join(root, 'packages', pkg, 'README.md');
  const text = readFileSync(file, 'utf8');
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${file}: missing ${START} … ${END} markers`);
  const next = `${text.slice(0, a + START.length)}\n\n${table(json)}\n\n${text.slice(b)}`;
  if (next !== text) {
    if (check) {
      console.error(`${pkg}/README.md is out of date. Run: node scripts/gen-config-docs.mjs`);
      stale = true;
    } else {
      writeFileSync(file, next);
      console.log(`updated packages/${pkg}/README.md`);
    }
  }
}
if (stale) process.exit(1);
