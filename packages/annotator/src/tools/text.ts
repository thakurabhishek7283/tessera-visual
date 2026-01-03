import type { Tool } from '../engine/tools.js';

/** Font size, in screen pixels, of a new text. It is stored in world units, so it scales with the image. */
export const TEXT_SCREEN_PX = 16;

/** Click empty space to write; click an existing text to edit it. */
export function textTool(): Tool {
  return {
    id: 'text',
    cursor: 'text',
    onPointerDown(e, ctx) {
      if (e.button !== 0) return;
      const { engine } = ctx;
      const hit = engine.hit(e.world);
      if (hit?.geometry.type === 'text') {
        engine.selection.set([hit.id]);
        void engine.editText(hit.id);
        return;
      }
      const edit = engine.hooks.editText;
      if (!edit || !engine.canEdit) return;
      const fontSize = Math.max(1, Math.round(TEXT_SCREEN_PX / engine.viewport.state.get().scale));
      const [x, y] = e.world;
      void edit({ x, y, fontSize, text: '' }).then((text) => {
        if (text !== null && text.trim() !== '') {
          return ctx.commit({ type: 'text', x, y, text, fontSize });
        }
        return null;
      });
    },
  };
}
