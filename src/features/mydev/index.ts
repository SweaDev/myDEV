/** F-01: the myDEV feed (SPEC §6.6) — composes the filter, tick buttons, tab and view. */
import type { FeatureContext, FeatureModule } from '../../core/types.ts';
import { createCheckButtons } from './check-button.ts';
import { startFeedFilter } from './feed-filter.ts';
import { createMyDevTab } from './mydev-tab.ts';
import { createMyDevView } from './mydev-view.ts';

export const MYDEV_FEATURE_ID = 'mydev';

let controller: AbortController | null = null;

export const myDevFeature: FeatureModule = {
  id: MYDEV_FEATURE_ID,

  /** Every home feed, including the myDEV view itself. */
  matches: (route) => route.kind === 'home',

  /**
   * Resolves once the first filter pass has run (or could not), so the bootstrap knows when the
   * pre-filter hiding can end. The tab is added first, so it shows even if the list is slow.
   */
  async init(ctx: FeatureContext) {
    controller?.abort();
    const own = new AbortController();
    controller = own;
    // The host aborts `ctx.signal` on route changes; `dispose()` aborts ours directly.
    if (ctx.signal.aborted) own.abort();
    else ctx.signal.addEventListener('abort', () => own.abort(), { once: true });

    const scoped: FeatureContext = { ...ctx, signal: own.signal };
    const buttons = createCheckButtons(scoped);
    const tab = createMyDevTab(scoped);
    createMyDevView(scoped, tab);
    await startFeedFilter(scoped, (card) => buttons.attach(card));
  },

  dispose() {
    controller?.abort();
    controller = null;
  },
};
