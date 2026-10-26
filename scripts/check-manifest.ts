/**
 * Guards SEC-1/SEC-2/SEC-7: fails the build if a manifest asks for anything beyond the approved
 * set. Returns the list of problems (empty means the manifest is fine).
 */

const ALLOWED_KEYS = new Set([
  'manifest_version',
  'name',
  'version',
  'description',
  'permissions',
  'icons',
  'content_scripts',
  'content_security_policy',
  'background',
  'browser_specific_settings',
]);

export const EXPECTED_CSP = "script-src 'self'; object-src 'self'";
export const EXPECTED_MATCHES = ['https://dev.to/*'];

type Json = unknown;
const isRecord = (value: Json): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const sameList = (a: Json, b: readonly string[]) =>
  Array.isArray(a) && a.length === b.length && a.every((item, i) => item === b[i]);

export function checkManifest(manifest: Json): string[] {
  if (!isRecord(manifest)) return ['manifest is not an object'];
  const problems: string[] = [];

  if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_KEYS.has(key)) problems.push(`key "${key}" is not on the allowlist (SEC-1)`);
  }

  if (!sameList(manifest.permissions, ['storage'])) {
    problems.push('permissions must be exactly ["storage"] (SEC-1)');
  }

  if (manifest.content_security_policy === undefined) {
    problems.push('content_security_policy must be set (SEC-2)');
  } else if (
    !isRecord(manifest.content_security_policy) ||
    Object.keys(manifest.content_security_policy).join() !== 'extension_pages' ||
    manifest.content_security_policy.extension_pages !== EXPECTED_CSP
  ) {
    problems.push(
      `content_security_policy must be exactly { extension_pages: "${EXPECTED_CSP}" } (SEC-2)`,
    );
  }

  const scripts = manifest.content_scripts;
  if (!Array.isArray(scripts) || scripts.length === 0) {
    problems.push('content_scripts must declare the dev.to content script');
  } else {
    scripts.forEach((script: Json, index) => {
      const where = `content_scripts[${index}]`;
      if (!isRecord(script)) return void problems.push(`${where} is not an object`);
      if (!sameList(script.matches, EXPECTED_MATCHES)) {
        problems.push(
          `${where}.matches must be exactly ${JSON.stringify(EXPECTED_MATCHES)} (SEC-1)`,
        );
      }
      if (script.exclude_matches !== undefined || script.include_globs !== undefined) {
        problems.push(`${where} must not use exclude_matches / include_globs`);
      }
      if (script.all_frames === true) problems.push(`${where}.all_frames must not be true`);
      if (script.match_about_blank === true || script.match_origin_as_fallback === true) {
        problems.push(`${where} must not match about:blank or origin fallbacks`);
      }
      if (script.world !== undefined && script.world !== 'ISOLATED') {
        problems.push(`${where}.world must be ISOLATED (SEC-7)`);
      }
      if (script.run_at !== 'document_start')
        problems.push(`${where}.run_at must be document_start`);
    });
  }

  const background = manifest.background;
  if (!isRecord(background)) {
    problems.push('background must be declared');
  } else if (!(
    typeof background.service_worker === 'string' || Array.isArray(background.scripts)
  )) {
    problems.push('background needs a service_worker or scripts entry');
  }

  return problems;
}
