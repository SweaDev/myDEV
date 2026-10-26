/** Attributes the extension puts on dev.to elements (SPEC §6.5: every node it touches is marked). */
export const MARKER = {
  /** Feature-created nodes carry `data-mydev="<role>"`. */
  owned: 'data-mydev',
  /** A native card hidden by the extension. */
  hidden: 'data-mydev-hidden',
  /** A native card the feed filter has already handled. */
  processed: 'data-mydev-processed',
} as const;
