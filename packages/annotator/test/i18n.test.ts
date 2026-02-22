import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de.js';
import { en } from '../src/i18n/en.js';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });

describe('messages', () => {
  it('has the same keys in English and German', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps the same placeholders in both languages', () => {
    const slots = (s: string): string[] =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
    for (const key of Object.keys(en))
      expect([key, slots(de[key] ?? '')]).toEqual([key, slots(en[key] ?? '')]);
  });

  it('defines every key the code looks up', () => {
    const used = new Set<string>();
    for (const file of files(join(import.meta.dirname, '../src'))) {
      if (file.includes('/i18n/')) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9.-]+)'/g))
        used.add(m[1] as string);
    }
    const missing = [...used].filter(
      (key) => !(key in en) && !(`${key}.other` in en) && !(`${key}.one` in en),
    );
    expect(missing).toEqual([]);
  });
});
