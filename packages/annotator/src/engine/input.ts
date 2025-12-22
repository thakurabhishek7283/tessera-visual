import type { AnnotatorEngine } from './engine.js';
import { handleShortcut } from './shortcuts.js';
import type { KeyInput, NormalizedPointer } from './tools.js';

const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !('tagName' in el)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
};

/** Turns DOM pointer, wheel and key events into engine calls. Returns a function that detaches. */
export function attachInput(
  engine: AnnotatorEngine,
  surface: SVGSVGElement,
  host: HTMLElement,
): () => void {
  const touches = new Map<number, { x: number; y: number }>();
  let gesture: 'tool' | 'pan' | 'pinch' | undefined;
  let panLast: { x: number; y: number } | undefined;
  let pinch: { distance: number; cx: number; cy: number } | undefined;

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const box = surface.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  };

  // Capturing keeps a drag alive outside the canvas. It throws for pointers the browser does not
  // know (synthetic events in tests), which is harmless.
  const capture = (id: number, on: boolean): void => {
    try {
      if (on) surface.setPointerCapture(id);
      else surface.releasePointerCapture(id);
    } catch {
      /* no active pointer with that id */
    }
  };

  const normalize = (e: PointerEvent): NormalizedPointer => {
    const screen = local(e);
    return {
      world: engine.viewport.screenToWorld(screen),
      screen,
      pressure: e.pointerType === 'mouse' ? 0.5 : e.pressure > 0 ? e.pressure : 0.5,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.ctrlKey || e.metaKey,
      button: e.button,
      pointerType: e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse',
    };
  };

  const pinchState = (): { distance: number; cx: number; cy: number } | undefined => {
    const [a, b] = [...touches.values()];
    if (!a || !b) return undefined;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        // A second finger turns whatever the first one started into a pan/zoom.
        engine.tools.cancel();
        gesture = 'pinch';
        pinch = pinchState();
        return;
      }
    }
    if (gesture === 'pinch') return;
    capture(e.pointerId, true);
    host.focus({ preventScroll: true });
    if (e.button === 1) {
      e.preventDefault();
      gesture = 'pan';
      panLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    gesture = 'tool';
    engine.tools.pointerDown(normalize(e));
    if (engine.tools.currentId === 'pan') panLast = { x: e.clientX, y: e.clientY };
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (gesture === 'pinch') {
      const next = pinchState();
      if (next && pinch) {
        const box = surface.getBoundingClientRect();
        engine.viewport.panBy(next.cx - pinch.cx, next.cy - pinch.cy);
        if (pinch.distance > 0)
          engine.viewport.zoomAt(
            [next.cx - box.left, next.cy - box.top],
            next.distance / pinch.distance,
          );
        pinch = next;
      }
      return;
    }
    if (gesture === 'pan' && panLast) {
      engine.viewport.panBy(e.clientX - panLast.x, e.clientY - panLast.y);
      panLast = { x: e.clientX, y: e.clientY };
      return;
    }
    engine.tools.pointerMove(normalize(e));
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (gesture === 'pinch') {
        if (touches.size < 2) {
          pinch = undefined;
          gesture = touches.size === 0 ? undefined : 'pan';
          const [rest] = [...touches.values()];
          panLast = rest;
        }
        return;
      }
    }
    capture(e.pointerId, false);
    if (gesture === 'pan') {
      gesture = undefined;
      panLast = undefined;
      return;
    }
    if (gesture === 'tool') engine.tools.pointerUp(normalize(e));
    gesture = undefined;
    panLast = undefined;
  };

  const onCancel = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
    engine.tools.cancel();
    gesture = undefined;
    panLast = undefined;
    pinch = undefined;
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel as well.
      engine.viewport.zoomAt(local(e), Math.exp(-e.deltaY * 0.0015));
    } else {
      engine.viewport.panBy(-e.deltaX, -e.deltaY);
    }
  };

  const onDblClick = (e: MouseEvent): void => {
    const screen = local(e);
    engine.tools.doubleClick({
      world: engine.viewport.screenToWorld(screen),
      screen,
      pressure: 0.5,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.ctrlKey || e.metaKey,
      button: 0,
      pointerType: 'mouse',
    });
  };

  const input = (e: KeyboardEvent): KeyInput => ({
    key: e.key,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: e.ctrlKey || e.metaKey,
  });

  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e.target)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) engine.tools.holdPan(true);
      return;
    }
    const k = input(e);
    if (engine.tools.keyDown(k) || handleShortcut(engine, k)) e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === ' ') engine.tools.holdPan(false);
  };

  const onBlur = (): void => engine.tools.holdPan(false);

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onCancel);
  surface.addEventListener('dblclick', onDblClick);
  // Not passive: the wheel must not scroll the page while it zooms or pans the canvas.
  surface.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('keydown', onKeyDown);
  host.addEventListener('keyup', onKeyUp);
  host.addEventListener('blur', onBlur);

  return () => {
    surface.removeEventListener('pointerdown', onDown);
    surface.removeEventListener('pointermove', onMove);
    surface.removeEventListener('pointerup', onUp);
    surface.removeEventListener('pointercancel', onCancel);
    surface.removeEventListener('dblclick', onDblClick);
    surface.removeEventListener('wheel', onWheel);
    host.removeEventListener('keydown', onKeyDown);
    host.removeEventListener('keyup', onKeyUp);
    host.removeEventListener('blur', onBlur);
  };
}
