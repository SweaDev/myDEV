/** Post card → `MyDevRecordInput` snapshot (SPEC §5.1). Never throws; `null` means "can't snapshot". */
import { safeImageUrl, safeLinkUrl } from '../../core/url-guard.ts';
import type { MyDevRecordInput, SourceFeed } from '../../core/types.ts';
import { isIsoTimestamp, isMyDevRecordInput, isValidTag } from '../../core/validate.ts';
import { CARD } from './selectors.ts';

const MAX_TAGS = 10;
const USERNAME_HREF = /^\/([A-Za-z0-9_]{1,60})\/?$/;

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/** Absolute URL for an href that may be site-relative. */
const absolute = (href: string | null | undefined): string | null => {
  if (!href) return null;
  try {
    return new URL(href, 'https://dev.to').href;
  } catch {
    return null;
  }
};

export function postIdOf(card: Element): string | null {
  const id = card.getAttribute(CARD.idAttr);
  return id !== null && CARD.idPattern.test(id) ? id : null;
}

function readTags(card: Element): string[] {
  const tags: string[] = [];
  for (const link of card.querySelectorAll(CARD.tag)) {
    const href = link.getAttribute('href') ?? '';
    if (!href.startsWith(CARD.tagHrefPrefix)) continue;
    const tag = href.slice(CARD.tagHrefPrefix.length);
    if (isValidTag(tag) && !tags.includes(tag)) tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
}

function readCover(card: Element, titleLink: Element): string | null {
  const preload = safeImageUrl(titleLink.getAttribute(CARD.coverAttr));
  if (preload) return preload;
  return safeImageUrl(card.querySelector(CARD.coverImage)?.getAttribute('src'));
}

function readReadingTime(card: Element): number | null {
  const match = CARD.readingTimePattern.exec(
    card.querySelector(CARD.readingTime)?.textContent ?? '',
  );
  return match?.[1] ? Number(match[1]) : null;
}

export function parseCard(card: Element, sourceFeed: SourceFeed): MyDevRecordInput | null {
  try {
    const postId = postIdOf(card);
    const titleLink = card.querySelector(CARD.titleLink);
    if (postId === null || !titleLink) return null;

    const username = USERNAME_HREF.exec(
      card.querySelector(CARD.authorLink)?.getAttribute('href') ?? '',
    )?.[1];
    const published = card.querySelector(CARD.time)?.getAttribute('datetime')?.trim();

    return isMyDevRecordInput({
      postId,
      url: safeLinkUrl(absolute(titleLink.getAttribute('href'))),
      title: squash(titleLink.textContent),
      author: {
        name: squash(card.querySelector(CARD.authorName)?.textContent),
        username,
        avatarUrl: card.querySelector(CARD.authorAvatar)?.getAttribute('src') ?? null,
      },
      tags: readTags(card),
      coverImageUrl: readCover(card, titleLink),
      readingTimeMinutes: readReadingTime(card),
      publishedAt: isIsoTimestamp(published) ? published : null,
      sourceFeed,
    });
  } catch {
    return null;
  }
}
