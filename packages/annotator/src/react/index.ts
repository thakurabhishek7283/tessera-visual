import { useFeature, useStore } from '@tessera-kit/react';
import { wrapElement } from '@tessera-internal/react-wrap';
import { type RefObject, useEffect, useState } from 'react';
import type { AnnotatorConfigValue } from '../config.js';
import type { TesseraAnnotationList } from '../elements/annotation-list.js';
import type { TesseraAnnotatorElement } from '../elements/annotator.js';
import type { TesseraWhiteboardElement } from '../elements/whiteboard.js';
import type { Annotation } from '../geometry/model.js';
import type { AnnotatorApi, AnnotatorHandle } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrappers render empty tags that upgrade after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

type Detail<T> = (event: CustomEvent<T>) => void;

interface SurfaceProps {
  /** Hide the list of annotations beside the canvas. */
  noPanel?: boolean | undefined;
  readonly?: boolean | undefined;
  alt?: string | undefined;
  /** Options for this surface: `{ tools, labels, requireLabel, … }`. */
  config?: Partial<Omit<AnnotatorConfigValue, 'enabled'>> | undefined;
  /** Fires before a drawn shape is kept; call `event.preventDefault()` to discard it. */
  onAnnotationCreate?: Detail<{ annotation: Annotation }> | undefined;
  onAnnotationUpdate?: Detail<{ annotation: Annotation; before: Annotation }> | undefined;
  onAnnotationDelete?: Detail<{ annotation: Annotation }> | undefined;
  onSelectionChange?: Detail<{ ids: string[] }> | undefined;
  /** The surface is open: `event.detail.handle` is the {@link AnnotatorHandle}. */
  onReady?: Detail<{ handle: AnnotatorHandle }> | undefined;
}

const events = {
  onAnnotationCreate: 'annotation-create',
  onAnnotationUpdate: 'annotation-update',
  onAnnotationDelete: 'annotation-delete',
  onSelectionChange: 'selection-change',
  onReady: 'annotator-ready',
} as const;

export interface AnnotatorProps extends SurfaceProps {
  /** The image URL. */
  src: string;
  setId?: string | undefined;
}

/** `<tessera-annotator>` for React. */
export const Annotator = wrapElement<TesseraAnnotatorElement, AnnotatorProps>({
  tag: 'tessera-annotator',
  properties: ['config'],
  events,
  attributes: {
    src: 'src',
    setId: 'set-id',
    alt: 'alt',
    readonly: 'readonly',
    noPanel: 'no-panel',
  },
});

export interface WhiteboardProps extends SurfaceProps {
  boardId?: string | undefined;
}

/** `<tessera-whiteboard>` for React. */
export const Whiteboard = wrapElement<TesseraWhiteboardElement, WhiteboardProps>({
  tag: 'tessera-whiteboard',
  properties: ['config'],
  events,
  attributes: { boardId: 'board-id', alt: 'alt', readonly: 'readonly', noPanel: 'no-panel' },
});

export interface AnnotationListProps {
  /** Id of the annotator or whiteboard element this list belongs to. */
  for?: string | undefined;
  handle?: AnnotatorHandle | undefined;
}

/** `<tessera-annotation-list>` for React: the accessible list of shapes, usable beside the canvas. */
export const AnnotationList = wrapElement<TesseraAnnotationList, AnnotationListProps>({
  tag: 'tessera-annotation-list',
  properties: ['handle'],
  attributes: { for: 'for' },
  events: {},
});

/** The annotator API once the feature is enabled, or `undefined`. */
export function useAnnotatorApi(): AnnotatorApi | undefined {
  return useFeature('annotator');
}

interface HandleSource {
  handle?: AnnotatorHandle | undefined;
  addEventListener: HTMLElement['addEventListener'];
  removeEventListener: HTMLElement['removeEventListener'];
}

/**
 * The handle of an `<Annotator>` or `<Whiteboard>`, once it has opened. Pass the ref you gave it.
 *
 * @example
 * const ref = useRef<TesseraAnnotatorElement>(null);
 * const handle = useAnnotatorHandle(ref);
 * <Annotator ref={ref} src="/camp.jpg" />
 */
export function useAnnotatorHandle(
  ref: RefObject<HandleSource | null>,
): AnnotatorHandle | undefined {
  const [handle, setHandle] = useState<AnnotatorHandle>();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHandle(el.handle);
    const ready = (e: Event): void =>
      setHandle((e as CustomEvent<{ handle: AnnotatorHandle }>).detail.handle);
    const closed = (): void => setHandle(undefined);
    el.addEventListener('annotator-ready', ready);
    el.addEventListener('annotator-closed', closed);
    return () => {
      el.removeEventListener('annotator-ready', ready);
      el.removeEventListener('annotator-closed', closed);
    };
  }, [ref]);
  return handle;
}

const none: readonly Annotation[] = [];

/** The annotations of a surface, kept in step. Empty until the handle exists. */
export function useAnnotations(handle: AnnotatorHandle | undefined): readonly Annotation[] {
  const [list, setList] = useState<readonly Annotation[]>(handle?.annotations.get() ?? none);
  useEffect(() => {
    setList(handle?.annotations.get() ?? none);
    return handle?.annotations.subscribe(setList);
  }, [handle]);
  return list;
}

/** Ids of the selected annotations, kept in step. */
export function useSelection(handle: AnnotatorHandle | undefined): readonly string[] {
  const [ids, setIds] = useState<readonly string[]>(handle?.selection.get() ?? []);
  useEffect(() => {
    setIds(handle?.selection.get() ?? []);
    return handle?.selection.subscribe(setIds);
  }, [handle]);
  return ids;
}

export type {
  AnnotatorHandle,
  TesseraAnnotationList,
  TesseraAnnotatorElement,
  TesseraWhiteboardElement,
};
export { useStore };
