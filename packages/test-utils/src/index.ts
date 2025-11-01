import type { PluginLoader, TesseraConfig, TesseraInstance } from '@tessera/core';
import { createTestInstance, type TestInstanceOptions } from '@tessera/testing';
import axe from 'axe-core';
import { render, type TemplateResult } from 'lit';
import { expect } from 'vitest';

/** Waits for an element and every Lit element in its shadow tree to finish rendering. */
export async function settle(el: Element): Promise<void> {
  const pending: Array<Promise<unknown>> = [];
  const visit = (node: Element | ShadowRoot): void => {
    for (const child of node.querySelectorAll('*')) {
      const updateComplete = (child as { updateComplete?: Promise<unknown> }).updateComplete;
      if (updateComplete) pending.push(updateComplete);
      if (child.shadowRoot) visit(child.shadowRoot);
    }
  };
  const own = (el as { updateComplete?: Promise<unknown> }).updateComplete;
  if (own) pending.push(own);
  visit(el);
  if (el.shadowRoot) visit(el.shadowRoot);
  await Promise.all(pending);
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
}

/** Renders a Lit template into a fresh container and waits for nested elements to settle. */
export async function fixture<T extends Element = HTMLElement>(
  template: TemplateResult,
): Promise<T> {
  const host = document.createElement('div');
  document.body.append(host);
  render(template, host);
  const el = host.firstElementChild as T;
  await settle(el);
  return el;
}

export function cleanup(): void {
  document.body.replaceChildren();
}

/** Narrows `value` or fails the test with a clear message. */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);
  return value;
}

/** Polls until `fn` returns a truthy value (or throws away its failure) or the timeout passes. */
export async function until<T>(
  fn: () => T | null | undefined | false,
  timeoutMs = 4000,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    let value: T | null | undefined | false;
    try {
      value = fn();
    } catch (error) {
      if (Date.now() > end) throw error;
    }
    if (value) return value;
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Fails with a readable list when axe finds WCAG A/AA violations inside `el`. */
export async function expectAccessible(el: Element): Promise<void> {
  const results = await axe.run(el, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: {
      region: { enabled: false },
      'landmark-one-main': { enabled: false },
      'page-has-heading-one': { enabled: false },
    },
  });
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary).toEqual([]);
}

/** Deep query: finds the first element matching `selector` in `root` or any open shadow root below it. */
export function deepQuery<T extends Element = HTMLElement>(
  root: Element | ShadowRoot,
  selector: string,
): T | null {
  const direct = root.querySelector<T>(selector);
  if (direct) return direct;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const found = deepQuery<T>(el.shadowRoot, selector);
      if (found) return found;
    }
  }
  return null;
}

export interface MountedInstance {
  instance: TesseraInstance;
  /** A `<tessera-root>` in the document that provides `instance`. */
  root: HTMLElement & { tessera?: TesseraInstance };
}

/**
 * Creates a test instance (memory storage, fake clock, deterministic ids) and a `<tessera-root>`
 * wired to it. Needs `@tessera/elements/define` to have been imported by the test.
 */
export async function mountInstance(
  config: Partial<TesseraConfig> & Pick<TesseraConfig, 'features'>,
  plugins: Record<string, PluginLoader>,
  opts: TestInstanceOptions = {},
): Promise<MountedInstance> {
  const { instance } = await createTestInstance(config, plugins, opts);
  const root = document.createElement('tessera-root') as MountedInstance['root'];
  root.tessera = instance;
  document.body.append(root);
  return { instance, root };
}
