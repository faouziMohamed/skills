import {promises as fs, readdirSync} from 'node:fs';
import path from 'node:path';
import {
  ASSET_ROUTES,
  SECTION_IDS,
  TASK_ID_PATTERN,
} from '../../shared/routes.constant.mjs';
import {httpError} from './http.util.mjs';

/** @typedef {import('../../shared/types.mjs').VendorCache} VendorCache */

const contentTypes = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const servedFolders = [
  {folder: 'client', extensions: ['.js']},
  {folder: 'shared', extensions: ['.mjs']},
];
const pagePaths = new Set(['/', ...SECTION_IDS.map(id => `/${id}`)]);
const vendorPrefix = ASSET_ROUTES.vendor.replace(':file', '');

/**
 * Serves the page for every UI route, plus `client/`, `shared/`, the stylesheet and the cached `/vendor/` libraries; never server code.
 * @param {string} uiDir The `dev-server/` folder.
 * @param {VendorCache} vendorCache Source of the downloaded browser libraries.
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, url: URL) => Promise<boolean>}
 */
export function createStaticFiles(uiDir, vendorCache) {
  const assets = new Map([['/styles.css', 'styles.css']]);
  for (const {folder, extensions} of servedFolders) {
    for (const file of listFiles(path.join(uiDir, folder))) {
      if (!extensions.includes(path.extname(file))) continue;
      const relative = path.join(folder, file).split(path.sep).join('/');
      assets.set(`/${relative}`, relative);
    }
  }

  async function send(response, relative, contentType) {
    const body = await fs.readFile(path.join(uiDir, relative), 'utf8');
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    response.end(body);
  }

  return async function serveStatic(request, response, url) {
    if (request.method !== 'GET') return false;
    if (isPage(url.pathname)) {
      await send(response, 'index.html', 'text/html; charset=utf-8');
      return true;
    }
    if (url.pathname.startsWith(vendorPrefix)) {
      const file = url.pathname.slice(vendorPrefix.length);
      const cached = await resolveVendor(vendorCache, file);
      if (!cached) return false;
      await sendCachedLibrary(request, response, cached);
      return true;
    }
    const relative = assets.get(url.pathname);
    if (!relative) return false;
    await send(response, relative, contentTypes[path.extname(relative)]);
    return true;
  };
}

async function resolveVendor(vendorCache, file) {
  try {
    return await vendorCache.resolve(file);
  } catch (error) {
    console.error(`vendor ${file}: ${error.message}`);
    throw httpError(503, `${file} is not available yet; see the server log`);
  }
}

async function sendCachedLibrary(request, response, file) {
  const {size, mtimeMs} = await fs.stat(file);
  const etag = `"${size}-${Math.trunc(mtimeMs)}"`;
  const headers = {
    'Content-Type': contentTypes['.js'],
    'Cache-Control': 'no-cache',
    ETag: etag,
  };
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, headers);
  response.end(await fs.readFile(file));
}

function isPage(pathname) {
  if (pagePaths.has(pathname)) return true;
  const match = /^\/tasks\/([^/]+)$/.exec(pathname);
  return Boolean(match && TASK_ID_PATTERN.test(match[1]));
}

function listFiles(directory) {
  return readdirSync(directory, {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry =>
      path.relative(directory, path.join(entry.parentPath, entry.name)),
    );
}
