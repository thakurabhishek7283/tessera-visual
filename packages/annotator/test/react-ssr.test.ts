import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnnotationList, Annotator, Whiteboard } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render empty tags with attributes and never touch the DOM', () => {
    expect(typeof customElements).toBe('undefined');
    const html = renderToString(
      createElement(Annotator, { src: '/camp.jpg', setId: 'camp', readonly: true, noPanel: true }),
    );
    expect(html).toMatch(/^<tessera-annotator/);
    expect(html).toContain('src="/camp.jpg"');
    expect(html).toContain('set-id="camp"');
    expect(html).toContain('readonly=""');
    expect(html).toContain('no-panel=""');
    expect(renderToString(createElement(Whiteboard, { boardId: 'standup' }))).toContain(
      'board-id="standup"',
    );
    expect(renderToString(createElement(AnnotationList, { for: 'a' }))).toContain('for="a"');
  });
});
