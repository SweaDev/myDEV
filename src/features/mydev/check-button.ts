/** The tick button on every post card (FR-2, FR-3; SPEC §4). */
import { el } from '../../core/dom.ts';
import { MARKER } from '../../core/markers.ts';
import type { FeatureContext } from '../../core/types.ts';
import { checkIcon } from './icons.ts';

export const TICK_ROLE = 'tick';
const ERROR_ROLE = 'tick-error';
const ERROR_MS = 4000;

const LABEL_ADD = 'Add to myDEV';
const LABEL_REMOVE = 'Remove from myDEV';

export const tickSelector = `button[${MARKER.owned}="${TICK_ROLE}"]`;

/** A tick button, unchecked (native feeds) or checked (myDEV view). Handlers are attached by the caller. */
export function createTickButton(checked: boolean): HTMLElement {
  const label = checked ? LABEL_REMOVE : LABEL_ADD;
  return el('button', {
    attrs: {
      type: 'button',
      class: 'mydev-tick',
      [MARKER.owned]: TICK_ROLE,
      'aria-pressed': checked,
      'aria-label': label,
      title: label,
    },
    children: [checkIcon(checked)],
  });
}

export function setTickChecked(button: HTMLElement, checked: boolean): void {
  const label = checked ? LABEL_REMOVE : LABEL_ADD;
  button.setAttribute('aria-pressed', String(checked));
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.replaceChildren(checkIcon(checked));
}

export function setTickBusy(button: HTMLElement, busy: boolean): void {
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
  button.toggleAttribute('disabled', busy);
}

export function errorMessageFor(code: unknown): string {
  switch (code) {
    case 'quota-exceeded':
      return 'Storage is full.';
    case 'unavailable':
      return "Couldn't reach the extension. Try again.";
    default:
      return "Couldn't save. Try again.";
  }
}

export interface CheckButtons {
  /** Adds the button to a card. Safe to call repeatedly: a card never gets two. */
  attach(card: Element): void;
}

/**
 * Wires tick buttons into the native feed. One delegated click listener on the feed container
 * handles every button; everything it created is removed when `ctx.signal` aborts.
 */
export function createCheckButtons(ctx: FeatureContext): CheckButtons {
  const { site, store, log, signal } = ctx;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const container = site.findFeedContainer();

  const showError = (button: HTMLElement, message: string) => {
    button.parentElement?.querySelector(`[${MARKER.owned}="${ERROR_ROLE}"]`)?.remove();
    const note = el('span', {
      text: message,
      attrs: { class: 'mydev-tick-error', role: 'status', [MARKER.owned]: ERROR_ROLE },
    });
    button.after(note);
    const timer = setTimeout(() => {
      timers.delete(timer);
      note.remove();
    }, ERROR_MS);
    timers.add(timer);
  };

  const cardOf = (node: Element): Element | null => {
    for (let current: Element | null = node; current; current = current.parentElement) {
      if (site.isPostCard(current)) return current;
    }
    return null;
  };

  const onClick = async (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>(tickSelector);
    if (!button || button.hasAttribute('disabled')) return;
    const card = cardOf(button);
    if (!card) return;

    setTickBusy(button, true);
    try {
      const record = site.parseCard(card);
      if (!record) {
        log.warn('could not read the post card');
        showError(button, "Couldn't read this post.");
        return;
      }
      await store.add(record);
      setTickChecked(button, true);
      site.hideCard(card);
    } catch (error) {
      log.warn('could not save the post', error);
      showError(button, errorMessageFor((error as { code?: unknown } | null)?.code));
    } finally {
      setTickBusy(button, false);
    }
  };

  container?.addEventListener('click', onClick, { signal });

  signal.addEventListener(
    'abort',
    () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      container
        ?.querySelectorAll(`${tickSelector}, [${MARKER.owned}="${ERROR_ROLE}"]`)
        .forEach((node) => node.remove());
    },
    { once: true },
  );

  return {
    attach(card) {
      if (signal.aborted || card.querySelector(tickSelector)) return;
      const anchor = site.findActionAnchor(card);
      if (!anchor) {
        log.warnOnce('no-action-anchor', 'no place for the tick button on a post card');
        return;
      }
      const button = createTickButton(false);
      if (anchor.after) anchor.after.after(button);
      else anchor.parent.append(button);
    },
  };
}
