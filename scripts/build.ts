import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type InlineConfig } from 'vite';
import { checkManifest } from './check-manifest.ts';
import { mergeManifest } from './merge-manifest.ts';

type Browser = 'chrome' | 'firefox';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSERS: Browser[] = ['chrome', 'firefox'];

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const requested = args.filter((arg): arg is Browser => (BROWSERS as string[]).includes(arg));
const targets = requested.length > 0 ? requested : BROWSERS;

const readJson = async (path: string) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

function entryConfig(
  browser: Browser,
  entry: string,
  fileName: string,
  format: 'iife' | 'es',
): InlineConfig {
  return {
    root,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      outDir: resolve(root, 'dist', browser),
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      watch: watch ? {} : null,
      lib: {
        entry: resolve(root, entry),
        formats: [format],
        name: 'mydev',
        fileName: () => fileName,
      },
    },
  };
}

async function buildBrowser(browser: Browser): Promise<void> {
  const outDir = resolve(root, 'dist', browser);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Content scripts can't be ES modules, so they are always a single IIFE.
  await build(entryConfig(browser, 'src/content/index.ts', 'content.js', 'iife'));
  // Chrome runs the background as a module service worker; Firefox loads a classic script.
  await build(
    entryConfig(
      browser,
      'src/background/index.ts',
      'background.js',
      browser === 'chrome' ? 'es' : 'iife',
    ),
  );

  await cp(resolve(root, 'src/features/mydev/mydev.css'), resolve(outDir, 'mydev.css'));
  await cp(resolve(root, 'public/icons'), resolve(outDir, 'icons'), { recursive: true });

  const manifest = mergeManifest(
    await readJson('manifests/base.json'),
    await readJson(`manifests/${browser}.json`),
  );
  const problems = checkManifest(manifest);
  if (problems.length > 0) {
    throw new Error(`dist/${browser}/manifest.json is not allowed:\n - ${problems.join('\n - ')}`);
  }
  await writeFile(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`built dist/${browser}`);
}

for (const browser of targets) await buildBrowser(browser);
if (watch)
  console.log(
    'watching for changes (static assets and manifests are copied once; rerun to refresh)',
  );
