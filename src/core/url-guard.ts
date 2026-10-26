/** URL guard (SEC-4): the only way a value may reach an `href` or `src`. */

declare const safeUrlBrand: unique symbol;
/** A string that passed the URL guard. `core/dom.ts` accepts only this type for `href`/`src`. */
export type SafeUrl = string & { readonly [safeUrlBrand]: true };

const LINK_HOSTS: readonly string[] = ['dev.to'];

/**
 * Hosts dev.to serves images from. Placeholder list: T-401 replaces it with the hosts found in the
 * real markup.
 */
export const IMAGE_HOSTS: readonly string[] = [
  'dev.to',
  'media2.dev.to',
  'dev-to-uploads.s3.amazonaws.com',
];

function guard(raw: unknown, hosts: readonly string[]): SafeUrl | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '' || url.port !== '') return null;
  if (!hosts.includes(url.hostname)) return null;
  return url.href as SafeUrl;
}

/** An absolute `https://dev.to/...` URL, or `null`. */
export function safeLinkUrl(raw: unknown): SafeUrl | null {
  return guard(raw, LINK_HOSTS);
}

/** An absolute https URL on an allowlisted image host, or `null`. */
export function safeImageUrl(raw: unknown): SafeUrl | null {
  return guard(raw, IMAGE_HOSTS);
}
