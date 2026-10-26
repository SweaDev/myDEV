/**
 * Safe DOM construction (SEC-3). Every piece of UI is built with `el()` / `svg()`: text goes through
 * `textContent`, tags and attributes come from allowlists, and `href`/`src` accept only values that
 * pass the URL guard. There is deliberately no way to pass an HTML string.
 */
import { safeImageUrl, safeLinkUrl, type SafeUrl } from './url-guard.ts';

const HTML_TAGS = new Set([
  'a',
  'article',
  'aside',
  'button',
  'div',
  'em',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'img',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'small',
  'span',
  'strong',
  'time',
  'ul',
]);

const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'rect', 'title']);

const PLAIN_ATTRS = new Set([
  'class',
  'id',
  'alt',
  'title',
  'role',
  'type',
  'datetime',
  'loading',
  'rel',
  'target',
]);
const SVG_ATTRS = new Set([
  'viewBox',
  'd',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'x',
  'y',
  'rx',
  'focusable',
  'class',
]);
const ARIA_ATTR = /^aria-[a-z]+$/;
const DATA_ATTR = /^data-mydev[a-z-]*$/;

export type AttrValue = string | number | boolean | null | undefined;
export type ElAttrs = Record<string, AttrValue | SafeUrl>;
export type Child = Node | null | undefined | false;

type Listeners = {
  [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
};

export interface ElOptions {
  attrs?: ElAttrs;
  /** Set through `textContent`; never parsed as HTML. */
  text?: string;
  children?: Child[];
  on?: Listeners;
  /** Removes `on` listeners when aborted. */
  signal?: AbortSignal;
}

function attrString(name: string, value: Exclude<AttrValue, null | undefined>): string | null {
  if (typeof value === 'boolean') {
    if (name.startsWith('aria-')) return String(value);
    return value ? '' : null;
  }
  return String(value);
}

function setHtmlAttr(node: HTMLElement, name: string, value: AttrValue | SafeUrl): void {
  if (value === null || value === undefined) return;

  if (name === 'href' || name === 'src') {
    // The SafeUrl type stops raw strings at compile time; re-checking stops casts at run time.
    const checked = name === 'href' ? safeLinkUrl(value) : safeImageUrl(value);
    if (checked === null || checked !== value) {
      throw new Error(`el(): refusing unsafe ${name}`);
    }
    node.setAttribute(name, checked);
    if (name === 'href') node.setAttribute('rel', 'noopener noreferrer');
    return;
  }

  if (!PLAIN_ATTRS.has(name) && !ARIA_ATTR.test(name) && !DATA_ATTR.test(name)) {
    throw new Error(`el(): attribute "${name}" is not allowed`);
  }
  const str = attrString(name, value);
  if (str !== null) node.setAttribute(name, str);
}

export function el<K extends string>(tag: K, options: ElOptions = {}): HTMLElement {
  if (!HTML_TAGS.has(tag)) throw new Error(`el(): tag "${tag}" is not allowed`);
  const node = document.createElement(tag);

  for (const [name, value] of Object.entries(options.attrs ?? {})) setHtmlAttr(node, name, value);
  if (options.text !== undefined) node.textContent = options.text;
  for (const child of options.children ?? []) if (child) node.append(child);

  const listenerOptions = options.signal ? { signal: options.signal } : undefined;
  for (const [type, handler] of Object.entries(options.on ?? {})) {
    node.addEventListener(type, handler as EventListener, listenerOptions);
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(
  tag: string,
  attrs: Record<string, string | number> = {},
  children: Child[] = [],
): SVGElement {
  if (!SVG_TAGS.has(tag)) throw new Error(`svg(): tag "${tag}" is not allowed`);
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (!SVG_ATTRS.has(name) && !ARIA_ATTR.test(name)) {
      throw new Error(`svg(): attribute "${name}" is not allowed`);
    }
    node.setAttribute(name, String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}
