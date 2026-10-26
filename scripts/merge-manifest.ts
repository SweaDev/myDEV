type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isObject = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep-merges `override` onto `base`. Objects merge, everything else (including arrays) is replaced. */
export function mergeManifest<T extends Json>(base: T, override: Json): T {
  if (!isObject(base) || !isObject(override)) return override as T;
  const result: { [key: string]: Json } = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] = isObject(existing) && isObject(value) ? mergeManifest(existing, value) : value;
  }
  return result as T;
}
