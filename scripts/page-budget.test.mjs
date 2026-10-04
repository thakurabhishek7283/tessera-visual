import { describe, expect, it } from 'vitest';
import {
  attribute,
  checkBudgets,
  duplicates,
  formatReport,
  initialChunks,
  markStatements,
  packageOf,
  splitRegions,
} from './page-budget-lib.mjs';

const workspace = {
  '/repo/packages/core': { name: '@tessera-kit/core', version: '0.1.0' },
  '/repo/packages/kanban': { name: '@tessera-kit/kanban', version: '0.1.0' },
  '/repo/packages/dnd': { name: '@tessera-internal/dnd', version: '0.0.0' },
};
const lookup = (file) => {
  for (const [dir, pkg] of Object.entries(workspace)) {
    if (file.startsWith(`${dir}/`)) return { ...pkg, dir };
  }
  return undefined;
};

describe('packageOf', () => {
  it('names a plain node_modules package', () => {
    expect(packageOf('/app/node_modules/lit/index.js', lookup)).toEqual({
      name: 'lit',
      version: undefined,
      dir: '/app/node_modules/lit',
    });
  });

  it('names a package in the pnpm store and reads its version from the store directory', () => {
    const id = '/repo/node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js';
    expect(packageOf(id, lookup)).toMatchObject({ name: 'zod', version: '4.6.5' });
  });

  it('names a scoped package in the pnpm store, with a peer suffix on the store directory', () => {
    const id =
      '/repo/node_modules/.pnpm/@lit+react@1.0.8_@types+react@19.3.0/node_modules/@lit/react/index.js';
    expect(packageOf(id, lookup)).toMatchObject({ name: '@lit/react', version: '1.0.8' });
  });

  it('uses the innermost node_modules for nested dependencies', () => {
    const id = '/repo/node_modules/a/node_modules/@scope/b/dist/x.js';
    expect(packageOf(id, lookup).name).toBe('@scope/b');
  });

  it('handles Windows paths and query strings', () => {
    const id =
      'C:\\repo\\node_modules\\.pnpm\\idb@8.0.3\\node_modules\\idb\\build\\index.js?commonjs';
    expect(packageOf(id, lookup)).toMatchObject({ name: 'idb', version: '8.0.3' });
  });

  it('names workspace packages through the package.json lookup', () => {
    expect(packageOf('/repo/packages/core/dist/index.js', lookup)).toMatchObject({
      name: '@tessera-kit/core',
      dir: '/repo/packages/core',
    });
  });

  it('labels bundler virtual modules and unknown files', () => {
    expect(packageOf('\0rolldown/runtime.js', lookup).name).toBe('(bundler runtime)');
    expect(packageOf('/elsewhere/file.js', lookup).name).toBe('(unknown)');
  });
});

describe('markStatements', () => {
  const built = [
    '//#region ../dnd/src/sortable.ts',
    'function sortable() {}',
    'const css = `',
    'x { }`;',
    '//#endregion',
    '//#region src/board.ts',
    'class Board {}',
    '//#endregion',
    'export { Board };',
  ].join('\n');
  const starts = (code, ...snippets) => snippets.map((snippet) => code.indexOf(snippet));

  it('marks every top-level statement with its region, and code outside regions with none', () => {
    const marked = markStatements(
      built,
      starts(built, 'function sortable', 'const css', 'class Board', 'export {'),
    );
    expect(marked).toBe(
      [
        '//#region ../dnd/src/sortable.ts',
        '/** #region ../dnd/src/sortable.ts */',
        'function sortable() {}',
        '/** #region ../dnd/src/sortable.ts */',
        'const css = `',
        'x { }`;',
        '//#endregion',
        '//#region src/board.ts',
        '/** #region src/board.ts */',
        'class Board {}',
        '//#endregion',
        '/** #region  */',
        'export { Board };',
      ].join('\n'),
    );
  });

  it('leaves files without regions alone', () => {
    expect(markStatements('const a = 1;', [0])).toBeNull();
  });
});

describe('splitRegions', () => {
  const owner = (region) => region ?? 'host';

  it('gives a module without marks to its host', () => {
    const code = '//#region packages/core/dist/index.js\nconst a = 1;\n//#endregion';
    expect(splitRegions(code, owner)).toEqual([{ owner: 'host', bytes: code.length }]);
  });

  it('splits a rendered kit module into the packages tsdown inlined, merging runs', () => {
    const code = [
      '//#region packages/kanban/dist/index.js',
      '/** #region ../dnd/src/sortable.ts */',
      'function sortable() {}',
      '/** #region ../dnd/src/sortable.ts */',
      'const css = `x`;',
      '/** #region src/board.ts */',
      'class Board {}',
      '/** #region  */',
      'Board.x = 1;',
      '//#endregion',
    ].join('\n');
    expect(splitRegions(code, owner).map((p) => p.owner)).toEqual([
      '../dnd/src/sortable.ts',
      'src/board.ts',
      'host',
    ]);
  });

  it('ignores runs that hold only comments', () => {
    const code =
      '//#region x\n/** #region ../dnd/src/a.ts */\n/** doc */\n/** #region src/a.ts */\nlet a;';
    expect(splitRegions(code, owner).map((p) => p.owner)).toEqual(['src/a.ts']);
  });
});

describe('initialChunks', () => {
  it('follows static imports from entries and skips dynamic ones', () => {
    const chunks = [
      { fileName: 'page.js', isEntry: true, imports: ['shared.js'] },
      { fileName: 'shared.js', isEntry: false, imports: [] },
      { fileName: 'lazy.js', isEntry: false, imports: ['shared.js'] },
    ];
    expect([...initialChunks(chunks)].sort()).toEqual(['page.js', 'shared.js']);
  });
});

describe('attribute and duplicates', () => {
  const chunks = [
    {
      initial: true,
      gzip: 1000,
      parts: [
        { name: 'zod', copy: '@4.6.5', bytes: 600 },
        { name: '@tessera-internal/dnd', copy: 'kanban', bytes: 200 },
        { name: '@tessera-internal/dnd', copy: 'notes', bytes: 200 },
      ],
    },
    { initial: false, gzip: 500, parts: [{ name: 'zod', copy: '@4.6.5', bytes: 100 }] },
  ];

  it('splits each chunk by rendered share and separates initial from lazy bytes', () => {
    const { packages } = attribute(chunks);
    expect(packages).toEqual([
      { name: 'zod', initialGzip: 600, totalGzip: 1100 },
      { name: '@tessera-internal/dnd', initialGzip: 400, totalGzip: 400 },
    ]);
  });

  it('counts a package inlined into two kits as two copies', () => {
    expect(duplicates(attribute(chunks).copies)).toEqual([
      { name: '@tessera-internal/dnd', copies: ['kanban', 'notes'] },
    ]);
  });
});

describe('checkBudgets', () => {
  const page = { name: 'base', initialGzip: 50_000, initialBrotli: 44_000, totalGzip: 60_000 };

  it('passes when every metric is within budget', () => {
    expect(checkBudgets([page], { base: { initialGzip: 50_000, totalGzip: 61_000 } })).toEqual([]);
  });

  it('explains which metric is over and by how much', () => {
    expect(checkBudgets([page], { base: { initialGzip: 48_000 } })).toEqual([
      'base: initial gzip is 50.0 KB, over its budget of 48.0 KB by 2.0 KB (+4.2%).',
    ]);
  });

  it('fails a page without a budget and a budget without a page', () => {
    const problems = checkBudgets([page], { gone: { initialGzip: 1 }, $comment: 'ignored' });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^base: no budget/);
    expect(problems[1]).toMatch(/^gone: has a budget but no entry file/);
  });
});

describe('formatReport', () => {
  it('renders the summary table, top packages and duplicates', () => {
    const results = [
      {
        name: 'kanban+notes-page',
        initialGzip: 90_000,
        initialBrotli: 80_000,
        totalGzip: 120_000,
        chunks: 4,
        packages: [
          { name: 'zod', initialGzip: 27_000, totalGzip: 27_000 },
          { name: '@tessera-kit/kanban', initialGzip: 20_000, totalGzip: 25_000 },
          { name: '@tessera-internal/persist', initialGzip: 1_000, totalGzip: 1_000 },
        ],
        duplicates: [{ name: '@tessera-internal/persist', copies: ['kanban', 'notes'] }],
      },
      {
        name: 'base',
        initialGzip: 54_500,
        initialBrotli: 48_000,
        totalGzip: 66_500,
        chunks: 5,
        packages: [{ name: 'zod', initialGzip: 27_900, totalGzip: 27_900 }],
        duplicates: [],
      },
    ];
    const budgets = { 'kanban+notes-page': { initialGzip: 85_000 }, base: { initialGzip: 56_200 } };
    expect(
      formatReport(results, budgets, { external: ['react', 'react-dom'], top: 2 }),
    ).toMatchSnapshot();
  });
});
