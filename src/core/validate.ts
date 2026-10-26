/**
 * Hand-written validators (SEC-5). Each one returns a normalised copy of the input (strings
 * trimmed, unknown fields stripped) or `null`. URL fields that fail the URL guard become `null`
 * (SEC-4); any other invalid field rejects the whole value.
 */
import { safeImageUrl, safeLinkUrl } from './url-guard.ts';
import {
  SCHEMA_VERSION,
  type ErrorCode,
  type FeatureSettings,
  type Meta,
  type MyDevRecord,
  type MyDevRecordInput,
  type Request,
  type Settings,
  type SourceFeed,
} from './types.ts';

const POST_ID = /^\d{1,20}$/;
const USERNAME = /^[A-Za-z0-9_]{1,60}$/;
const TAG = /^[a-z0-9]{1,40}$/;
const FEATURE_ID = /^[a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const SOURCE_FEEDS: readonly SourceFeed[] = [
  'relevant',
  'latest',
  'top',
  'discover',
  'following',
  'curated',
  'unknown',
];
const MAX_TAGS = 10;

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Dict)
    : null;
}

/** Own-property read, so prototype-inherited values never count. */
function field(obj: Dict, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

function timestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isUndefinedOrNull(value: unknown): boolean {
  return value === undefined || value === null;
}

export function isMyDevRecordInput(raw: unknown): MyDevRecordInput | null {
  const obj = asDict(raw);
  if (!obj) return null;

  const postId = field(obj, 'postId');
  if (typeof postId !== 'string' || !POST_ID.test(postId)) return null;

  const url = safeLinkUrl(field(obj, 'url'));
  if (url === null) return null;

  const title = text(field(obj, 'title'), 1, 300);
  if (title === null) return null;

  const authorRaw = asDict(field(obj, 'author'));
  if (!authorRaw) return null;
  const authorName = text(field(authorRaw, 'name'), 1, 120);
  const username = field(authorRaw, 'username');
  if (authorName === null || typeof username !== 'string' || !USERNAME.test(username)) return null;

  const tagsRaw = field(obj, 'tags');
  if (!Array.isArray(tagsRaw) || tagsRaw.length > MAX_TAGS) return null;
  const tags: string[] = [];
  for (const tag of tagsRaw) {
    if (typeof tag !== 'string' || !TAG.test(tag)) return null;
    tags.push(tag);
  }

  const readingRaw = field(obj, 'readingTimeMinutes');
  let readingTimeMinutes: number | null = null;
  if (!isUndefinedOrNull(readingRaw)) {
    if (
      typeof readingRaw !== 'number' ||
      !Number.isInteger(readingRaw) ||
      readingRaw < 0 ||
      readingRaw > 600
    ) {
      return null;
    }
    readingTimeMinutes = readingRaw;
  }

  const publishedRaw = field(obj, 'publishedAt');
  let publishedAt: string | null = null;
  if (!isUndefinedOrNull(publishedRaw)) {
    const value = text(publishedRaw, 1, 40);
    if (value === null || !ISO_8601.test(value) || Number.isNaN(Date.parse(value))) return null;
    publishedAt = value;
  }

  const sourceFeed = field(obj, 'sourceFeed');
  if (typeof sourceFeed !== 'string' || !SOURCE_FEEDS.includes(sourceFeed as SourceFeed)) {
    return null;
  }

  return {
    postId,
    url,
    title,
    author: { name: authorName, username, avatarUrl: safeImageUrl(field(authorRaw, 'avatarUrl')) },
    tags,
    coverImageUrl: safeImageUrl(field(obj, 'coverImageUrl')),
    readingTimeMinutes,
    publishedAt,
    sourceFeed: sourceFeed as SourceFeed,
  };
}

export function isMyDevRecord(raw: unknown): MyDevRecord | null {
  const obj = asDict(raw);
  if (!obj) return null;
  const input = isMyDevRecordInput(obj);
  if (!input) return null;

  const addedAt = timestamp(field(obj, 'addedAt'));
  const updatedAt = timestamp(field(obj, 'updatedAt'));
  const deletedRaw = field(obj, 'deletedAt');
  const deletedAt = deletedRaw === null ? null : timestamp(deletedRaw);
  if (addedAt === null || updatedAt === null) return null;
  if (deletedRaw !== null && deletedAt === null) return null;
  if (field(obj, 'schemaVersion') !== SCHEMA_VERSION) return null;

  return { ...input, addedAt, updatedAt, deletedAt, schemaVersion: SCHEMA_VERSION };
}

export function isMeta(raw: unknown): Meta | null {
  const obj = asDict(raw);
  if (!obj) return null;
  const schemaVersion = field(obj, 'schemaVersion');
  const installId = field(obj, 'installId');
  if (typeof schemaVersion !== 'number' || !Number.isSafeInteger(schemaVersion)) return null;
  if (schemaVersion < 1) return null;
  if (typeof installId !== 'string' || !UUID.test(installId)) return null;
  return { schemaVersion, installId: installId.toLowerCase() };
}

export function isSettings(raw: unknown): Settings | null {
  const obj = asDict(raw);
  const featuresRaw = obj ? asDict(field(obj, 'features')) : null;
  if (!featuresRaw) return null;
  const features: Record<string, FeatureSettings> = Object.create(null);
  for (const id of Object.keys(featuresRaw)) {
    if (!FEATURE_ID.test(id)) return null;
    const entry = asDict(featuresRaw[id]);
    const enabled = entry ? field(entry, 'enabled') : undefined;
    if (typeof enabled !== 'boolean') return null;
    features[id] = { enabled };
  }
  return { features: { ...features } };
}

export type ParsedRequest = { ok: true; request: Request } | { ok: false; code: ErrorCode };

/** Like `isRequest`, but says why a message was rejected. */
export function parseRequest(raw: unknown): ParsedRequest {
  const obj = asDict(raw);
  if (!obj) return { ok: false, code: 'invalid-request' };
  if (field(obj, 'v') !== 1) return { ok: false, code: 'unsupported-version' };

  switch (field(obj, 'type')) {
    case 'mydev/add': {
      const record = isMyDevRecordInput(field(obj, 'record'));
      return record
        ? { ok: true, request: { v: 1, type: 'mydev/add', record } }
        : { ok: false, code: 'invalid-request' };
    }
    case 'mydev/remove': {
      const postId = field(obj, 'postId');
      return typeof postId === 'string' && POST_ID.test(postId)
        ? { ok: true, request: { v: 1, type: 'mydev/remove', postId } }
        : { ok: false, code: 'invalid-request' };
    }
    case 'mydev/list':
      return { ok: true, request: { v: 1, type: 'mydev/list' } };
    case 'mydev/activeIds':
      return { ok: true, request: { v: 1, type: 'mydev/activeIds' } };
    default:
      return { ok: false, code: 'unknown-type' };
  }
}

export function isRequest(raw: unknown): Request | null {
  const parsed = parseRequest(raw);
  return parsed.ok ? parsed.request : null;
}
