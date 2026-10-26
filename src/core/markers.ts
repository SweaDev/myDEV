/** Attributes the extension puts on dev.to elements (SPEC §6.5: every node it touches is marked). */
export const MARKER = {
  /** Feature-created nodes carry `data-mydev="<role>"`. */
  owned: 'data-mydev',
  /** A native card hidden by the extension. */
  hidden: 'data-mydev-hidden',
  /** A native card the feed filter has already handled. */
  processed: 'data-mydev-processed',
  /** The native feed container, hidden while the myDEV view is open. */
  feedHidden: 'data-mydev-feed-hidden',
  /** On <html> while the ID set loads: unprocessed cards stay invisible (SPEC §8.2). */
  prefilter: 'data-mydev-prefilter',
} as const;
