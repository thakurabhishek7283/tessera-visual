// Pure helpers behind scripts/page-budget.mjs: attribute bundled modules to packages, find inlined
// copies of the same package, format the Markdown report and compare pages against their budgets.
// Kept free of I/O (the package lookup is passed in) so the unit tests can run on fixed inputs.
//
// This file is copied verbatim into the kit repositories. Change it here first.

/** Normalises a module id to forward slashes and strips a `?query`. */
export function normaliseId(id) {
  return id.replaceAll('\\', '/').replace(/\?.*$/, '');
}

/**
 * Returns the package that owns a module id.
 *
 * Paths inside `node_modules` are named from the path alone, so pnpm's
 * `.pnpm/<name>@<version>/node_modules/<name>/…` layout and scoped names (`@scope/name`) both work.
 * Anything else (workspace packages, which pnpm links and the bundler resolves to their real path)
 * is named by `lookup(file)`, which returns the nearest package.json with a name, or undefined.
 *
 * @param {string} id module id as reported by the bundler
 * @param {(file: string) => { name: string, version?: string, dir: string } | undefined} lookup
 * @returns {{ name: string, version?: string, dir?: string }}
 */
export function packageOf(id, lookup) {
  if (id.startsWith('\0')) return { name: '(bundler runtime)' };
  const file = normaliseId(id);
  const marker = '/node_modules/';
  const at = file.lastIndexOf(marker);
  if (at !== -1) {
    const rest = file.slice(at + marker.length).split('/');
    const scoped = rest[0].startsWith('@');
    const name = scoped ? `${rest[0]}/${rest[1]}` : rest[0];
    const dir = file.slice(0, at + marker.length) + name;
    const store = /\/\.pnpm\/([^/]+)\/node_modules\/$/.exec(file.slice(0, at + marker.length));
    const version = store ? versionFromStoreDir(store[1], name) : undefined;
    return { name, version, dir };
  }
  const found = lookup(file);
  return found ?? { name: '(unknown)' };
}

/** `@lit+context@1.1.6_x` → `1.1.6` for `@lit/context`. */
function versionFromStoreDir(storeDir, name) {
  const prefix = `${name.replace('/', '+')}@`;
  if (!storeDir.startsWith(prefix)) return undefined;
  return storeDir.slice(prefix.length).split('_')[0];
}

const SOURCE_REGION = /^\/\/#(region|endregion)(?: (.*))?$/gm;
const MARK = /\/\*\* #region (.*?) \*\//g;

/**
 * Marks every top-level statement of a built file with the source region it came from.
 *
 * Published Tessera packages are built with tsdown, which bundles `@tessera-internal/*` source into
 * each kit and wraps every source file in `//#region <path relative to the package>` …
 * `//#endregion` line comments. The bundler drops those line comments when it renders a module, but
 * it keeps a doc comment for as long as the statement after it survives tree-shaking. So each
 * statement gets a `/** #region <path> *\/` doc comment; the minifier removes them from the final
 * chunk, so measured sizes don't change. Statements outside any region get an empty path.
 *
 * @param {string} code a built file
 * @param {number[]} starts start offsets (UTF-16) of its top-level statements, from a parser
 * @returns {string | null} the marked code, or null when the file has no regions
 */
export function markStatements(code, starts) {
  const regions = [...code.matchAll(SOURCE_REGION)].map((m) => ({
    at: m.index,
    path: m[1] === 'region' ? (m[2] ?? '').trim() : '',
  }));
  if (!regions.some((r) => r.path)) return null;
  let out = '';
  let last = 0;
  let r = -1;
  for (const start of [...starts].sort((a, b) => a - b)) {
    while (r + 1 < regions.length && regions[r + 1].at <= start) r++;
    const path = r === -1 ? '' : regions[r].path;
    out += `${code.slice(last, start)}/** #region ${path} */\n`;
    last = start;
  }
  return out + code.slice(last);
}

/**
 * Splits a rendered module into the packages its code came from, using the statement marks that
 * {@link markStatements} added. Code before the first mark, and code under an empty mark, belongs
 * to the module itself.
 *
 * @template T
 * @param {string} code rendered code of one module (comments intact)
 * @param {(region: string | null) => T} owner the owner of a region path (relative to the package
 *   that published the module), or of the module itself when `region` is null
 * @returns {Array<{ owner: T, bytes: number }>} one entry per run of statements from the same
 *   region, with the length of their code; runs with no code left are dropped
 */
export function splitRegions(code, owner) {
  const marks = [...code.matchAll(MARK)];
  const parts = [];
  const push = (region, text) => {
    if (significantBytes(text) === 0) return;
    const prev = parts.at(-1);
    if (prev && prev.region === region) prev.bytes += text.length;
    else parts.push({ region, bytes: text.length });
  };
  push(null, marks.length === 0 ? code : code.slice(0, marks[0].index));
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : code.length;
    push(m[1] || null, code.slice(m.index + m[0].length, end));
  });
  return parts.map((p) => ({ owner: owner(p.region), bytes: p.bytes }));
}

/** Length of the text once comments and whitespace are removed; 0 means "tree-shaken away". */
function significantBytes(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, '').length;
}

/**
 * Attributes one page's chunks to packages.
 *
 * Gzip size is measured per chunk; each package gets the share of a chunk's gzip size that its
 * rendered code makes up of that chunk. That's an estimate (compression doesn't split cleanly), but
 * it ranks contributors correctly, which is what the report is for.
 *
 * @param {Array<{ initial: boolean, gzip: number,
 *   parts: Array<{ name: string, copy: string, bytes: number }> }>} chunks
 * @returns {{ packages: Array<{ name: string, initialGzip: number, totalGzip: number }>,
 *   copies: Map<string, Set<string>> }} packages sorted by initial size, and the distinct copies
 *   (by label) of every package
 */
export function attribute(chunks) {
  const byName = new Map();
  const copies = new Map();
  for (const chunk of chunks) {
    const rendered = chunk.parts.reduce((sum, p) => sum + p.bytes, 0);
    for (const part of chunk.parts) {
      const share = rendered === 0 ? 0 : (part.bytes / rendered) * chunk.gzip;
      const row = byName.get(part.name) ?? { name: part.name, initialGzip: 0, totalGzip: 0 };
      row.totalGzip += share;
      if (chunk.initial) row.initialGzip += share;
      byName.set(part.name, row);
      const set = copies.get(part.name) ?? new Set();
      set.add(part.copy);
      copies.set(part.name, set);
    }
  }
  const packages = [...byName.values()]
    .map((r) => ({
      ...r,
      initialGzip: Math.round(r.initialGzip),
      totalGzip: Math.round(r.totalGzip),
    }))
    .sort(
      (a, b) =>
        b.initialGzip - a.initialGzip || b.totalGzip - a.totalGzip || a.name.localeCompare(b.name),
    );
  return { packages, copies };
}

/** Packages present more than once on a page, as `[{ name, copies: [label…] }]`, sorted by name. */
export function duplicates(copies) {
  return [...copies]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, copies: [...set].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The chunks loaded before anything else runs: the entry chunk and its static imports. */
export function initialChunks(chunks) {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !byFile.has(file)) return;
    seen.add(file);
    for (const dep of byFile.get(file).imports) visit(dep);
  };
  for (const c of chunks) if (c.isEntry) visit(c.fileName);
  return seen;
}

export const METRICS = /** @type {const} */ ([
  ['initialGzip', 'initial gzip'],
  ['initialBrotli', 'initial brotli'],
  ['totalGzip', 'total gzip'],
]);

/**
 * Compares measured pages with `budgets/pages.json` (`{ "<page>": { "initialGzip": bytes, … } }`).
 * Every page needs a budget and every budget needs a page, so neither can be dropped silently.
 *
 * @returns {string[]} one readable message per problem; empty when every page is within budget
 */
export function checkBudgets(results, budgets) {
  const problems = [];
  for (const page of results) {
    const budget = budgets[page.name];
    if (!budget) {
      problems.push(
        `${page.name}: no budget. Add "${page.name}" to budgets/pages.json (run with --init-missing to start at today's size + 3%).`,
      );
      continue;
    }
    for (const [key, label] of METRICS) {
      if (budget[key] === undefined) continue;
      const over = page[key] - budget[key];
      if (over > 0) {
        const pct = ((over / budget[key]) * 100).toFixed(1);
        problems.push(
          `${page.name}: ${label} is ${kb(page[key])}, over its budget of ${kb(budget[key])} by ${kb(over)} (+${pct}%).`,
        );
      }
    }
  }
  const measured = new Set(results.map((r) => r.name));
  for (const name of Object.keys(budgets)) {
    if (!name.startsWith('$') && !measured.has(name)) {
      problems.push(`${name}: has a budget but no entry file budgets/pages/${name}.ts.`);
    }
  }
  return problems;
}

export const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;

/**
 * Renders the report as Markdown.
 *
 * @param {Array<{ name: string, initialGzip: number, initialBrotli: number, totalGzip: number,
 *   chunks: number, packages: Array<{ name: string, initialGzip: number, totalGzip: number }>,
 *   duplicates: Array<{ name: string, copies: string[] }> }>} results
 * @param {Record<string, Record<string, number>>} budgets
 * @param {{ external: string[], top?: number }} options
 */
export function formatReport(results, budgets, { external, top = 10 }) {
  const lines = [];
  lines.push('## Page budgets', '');
  lines.push(
    'All dependencies bundled (minified ESM, code splitting on). "Initial" is the entry chunk and its static imports; "total" adds lazy chunks.',
  );
  if (external.length > 0) {
    lines.push(`Left out because the host app already pays for them: ${external.join(', ')}.`);
  }
  lines.push('');
  lines.push(
    '| Page | Initial gzip | Initial brotli | Total gzip | Chunks | Budget (initial gzip) | |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of results) {
    const budget = budgets[r.name]?.initialGzip;
    const over = METRICS.some(
      ([k]) => budgets[r.name]?.[k] !== undefined && r[k] > budgets[r.name][k],
    );
    const status = !budgets[r.name] ? 'no budget' : over ? 'over' : 'ok';
    lines.push(
      `| ${r.name} | ${kb(r.initialGzip)} | ${kb(r.initialBrotli)} | ${kb(r.totalGzip)} | ${r.chunks} | ${budget === undefined ? 'n/a' : kb(budget)} | ${status} |`,
    );
  }
  for (const r of results) {
    lines.push('', `### ${r.name}: top ${top} packages`, '');
    lines.push('| Package | Initial gzip | Total gzip | Share of initial |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const p of r.packages.slice(0, top)) {
      const share = r.initialGzip === 0 ? 0 : (p.initialGzip / r.initialGzip) * 100;
      lines.push(
        `| ${p.name} | ${kb(p.initialGzip)} | ${kb(p.totalGzip)} | ${share.toFixed(1)}% |`,
      );
    }
    lines.push('', `Duplicate packages: ${formatDuplicates(r.duplicates)}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatDuplicates(dups) {
  if (dups.length === 0) return 'none.';
  return `${dups.map((d) => `${d.name} ×${d.copies.length} (${d.copies.join(', ')})`).join('; ')}.`;
}
