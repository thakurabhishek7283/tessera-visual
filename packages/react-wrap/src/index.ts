import {
  createElement,
  type ForwardRefExoticComponent,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type RefAttributes,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';

export interface WrapOptions {
  /** The custom element's tag name. */
  tag: string;
  /** React props that are assigned as DOM properties (objects, functions, booleans, numbers). */
  properties: readonly string[];
  /** React prop → DOM event name, e.g. `{ onCardMove: 'card-move' }`. Handlers receive the event. */
  events: Readonly<Record<string, string>>;
  /** React prop → attribute name, for string props that CSS or the server markup should see. */
  attributes?: Readonly<Record<string, string>>;
}

// useLayoutEffect warns on the server; a plain effect never runs there either way.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Props<E extends HTMLElement, P> = P &
  Omit<HTMLAttributes<E>, keyof P | 'children'> & { children?: ReactNode };

/**
 * Wraps a custom element for React. Properties and events are wired in an effect, so rendering on
 * the server only emits the (empty) tag and the element upgrades on the client.
 */
export function wrapElement<E extends HTMLElement, P extends object>(
  options: WrapOptions,
): ForwardRefExoticComponent<Props<E, P> & RefAttributes<E>> {
  const Wrapped = forwardRef<E, Props<E, P>>((allProps, ref) => {
    const el = useRef<E | null>(null);
    useImperativeHandle(ref, () => el.current as E, []);

    const { children, className, ...rest } = allProps as Record<string, unknown> & {
      children?: ReactNode;
      className?: string;
    };
    const domProps: Record<string, unknown> = {};
    const attrs: Record<string, unknown> = {};
    const handlers: Record<string, ((event: Event) => void) | undefined> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (key in options.events) handlers[key] = value as (event: Event) => void;
      else if (options.properties.includes(key)) domProps[key] = value;
      else if (options.attributes && key in options.attributes) {
        if (value !== undefined && value !== false) {
          // React sets a property when the element has one, so a boolean must stay a boolean there.
          attrs[options.attributes[key] as string] = value;
        }
      } else attrs[key] = value;
    }

    // Assigned after every render: cheap, and keeps object/function properties current.
    useIsomorphicLayoutEffect(() => {
      const node = el.current as unknown as Record<string, unknown> | null;
      if (!node) return;
      for (const key of options.properties) {
        const next = domProps[key];
        if (node[key] !== next && (next !== undefined || key in node)) node[key] = next;
      }
    });

    const latest = useRef(handlers);
    latest.current = handlers;
    // A layout effect, so listeners exist before the element can fire anything: connecting it
    // may start asynchronous work that finishes before a passive effect would have run.
    useIsomorphicLayoutEffect(() => {
      const node = el.current;
      if (!node) return;
      const offs = Object.entries(options.events).map(([prop, name]) => {
        const listener = (event: Event): void => latest.current[prop]?.(event);
        node.addEventListener(name, listener);
        return () => node.removeEventListener(name, listener);
      });
      return () => {
        for (const off of offs) off();
      };
    }, []);

    return createElement(options.tag, { ref: el, class: className, ...attrs }, children);
  });
  Wrapped.displayName = `Tessera(${options.tag})`;
  return Wrapped as unknown as ForwardRefExoticComponent<Props<E, P> & RefAttributes<E>>;
}
