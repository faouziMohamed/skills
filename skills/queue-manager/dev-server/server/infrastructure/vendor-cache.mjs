import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @typedef {import('../../shared/types.mjs').VendorLibrary} VendorLibrary */
/** @typedef {import('../../shared/types.mjs').VendorCache} VendorCache */

const MIRRORS = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** @type {VendorLibrary[]} */
export const VENDOR_LIBRARIES = [
  {
    file: 'echarts.min.js',
    packageName: 'echarts',
    version: '5.5.1',
    packagePath: 'dist/echarts.min.js',
    size: 1_030_855,
    sha256: 'e84270bd0cd5bdf60fefc26d00c2a391cb2e81f4d26a7a9ee16185a54773a3cf',
    license: 'Apache-2.0',
  },
  {
    file: 'cytoscape.min.js',
    packageName: 'cytoscape',
    version: '3.30.2',
    packagePath: 'dist/cytoscape.min.js',
    size: 373_304,
    sha256: '83e8c54a6bec655bfd81df07df605649c268af69aeca67a5ea2da54ea42dac81',
    license: 'MIT',
  },
  {
    file: 'dagre.min.js',
    packageName: 'dagre',
    version: '0.8.5',
    packagePath: 'dist/dagre.min.js',
    size: 283_803,
    sha256: '62eb9787ccfdbdf4148d4d99d31dbf9ee4770eafee81e637d759b52aac22cd51',
    license: 'MIT',
  },
  {
    file: 'cytoscape-dagre.js',
    packageName: 'cytoscape-dagre',
    version: '2.5.0',
    packagePath: 'cytoscape-dagre.js',
    size: 12_665,
    sha256: 'bf70fe402991dcbff33e05a7e4a5271c78020bb75e85d1c80ab7538e4157112e',
    license: 'MIT',
  },
  {
    file: 'mermaid.min.js',
    packageName: 'mermaid',
    version: '11.17.2',
    packagePath: 'dist/mermaid.min.js',
    size: 3_572_661,
    sha256: '581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8',
    license: 'MIT',
  },
];

/**
 * Per-user cache for the browser libraries: downloaded once from a CDN, checked against the pinned size and SHA-256, then served locally.
 * @returns {VendorCache}
 */
export function createVendorCache() {
  const cacheDir = path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
    'queue-manager',
    'vendor',
  );
  const libraries = new Map(VENDOR_LIBRARIES.map(item => [item.file, item]));
  const pending = new Map();
  const verifiedStamps = new Map();

  async function ensure(library) {
    const target = path.join(
      cacheDir,
      `${library.packageName}@${library.version}`,
      library.file,
    );
    const stamp = await fileStamp(target);
    if (stamp && verifiedStamps.get(library.file) === stamp) return target;
    if (stamp && (await matchesPin(target, library))) {
      verifiedStamps.set(library.file, stamp);
      return target;
    }
    await writeAtomically(target, await download(library));
    verifiedStamps.set(library.file, await fileStamp(target));
    return target;
  }

  function resolve(file) {
    const library = libraries.get(file);
    if (!library) return Promise.resolve(undefined);
    if (!pending.has(file)) {
      const attempt = ensure(library).finally(() => pending.delete(file));
      pending.set(file, attempt);
    }
    return pending.get(file);
  }

  async function prefetch() {
    const results = await Promise.allSettled(
      VENDOR_LIBRARIES.map(library => resolve(library.file)),
    );
    return VENDOR_LIBRARIES.map(({file}, index) => ({
      file,
      error: results[index].reason?.message,
    }));
  }

  return {cacheDir, resolve, prefetch};
}

async function fileStamp(file) {
  try {
    const {size, mtimeMs} = await fs.stat(file);
    return `${size}:${mtimeMs}`;
  } catch {
    return '';
  }
}

async function matchesPin(file, library) {
  const body = await fs.readFile(file);
  return body.length === library.size && sha256(body) === library.sha256;
}

async function writeAtomically(target, body) {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.tmp.${process.pid}`;
  try {
    await fs.writeFile(temporary, body);
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, {force: true});
    throw error;
  }
}

async function download(library) {
  const failures = [];
  const {packageName, version, packagePath} = library;
  for (const mirror of MIRRORS) {
    const url = `${mirror}/${packageName}@${version}/${packagePath}`;
    try {
      const body = await fetchCapped(url, library.size);
      if (body.length !== library.size) throw new Error('size mismatch');
      if (sha256(body) !== library.sha256) throw new Error('checksum mismatch');
      return body;
    } catch (error) {
      failures.push(`${new URL(url).host}: ${error.message}`);
    }
  }
  throw new Error(
    `could not download ${library.file} (${failures.join('; ')})`,
  );
}

async function fetchCapped(url, limit) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > limit) throw new Error('larger than the pinned size');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
