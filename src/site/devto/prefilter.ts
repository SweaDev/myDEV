/**
 * The "no flash" rule (SPEC §8.2). While the ID set loads, post cards the feed filter has not handled
 * yet are invisible, so a card that will be hidden never paints. It is generated here, from
 * `selectors.ts`, so the CSS file holds no dev.to selectors. `visibility` (not `display`) keeps the
 * layout stable for the cards that stay.
 */
import { MARKER } from '../../core/markers.ts';
import { CARD, FEED } from './selectors.ts';

export function prefilterCss(): string {
  const cards = FEED.containers
    .map(
      (container) =>
        `html[${MARKER.prefilter}] ${container} ${CARD.root}:not([${MARKER.processed}])`,
    )
    .join(',\n');
  return `${cards} {\n  visibility: hidden !important;\n}\n`;
}
