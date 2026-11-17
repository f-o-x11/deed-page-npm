'use strict';
// deed-page: tiny client for the public deed.page API (https://deed.page/docs).
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = require('../package.json').version;
const DEFAULT_BASE = 'https://deed.page';
const BODY_LIMIT = 4 * 1000 * 1000; // per-request cap documented at https://deed.page/llms.txt
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TEXT_EXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.txt', '.md', '.svg', '.xml', '.csv', '.map', '.webmanifest', '.yml', '.yaml', '.toml']);
const SKIP = new Set(['.git', 'node_modules', '.DS_Store', '.deed-page']);

class DeedPageError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'DeedPageError';
    this.status = status;
    this.body = body;
    this.code = body && (body.error || body.code);
  }
}

function configDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'deed-page');
}
function tokenPath() { return path.join(configDir(), 'token'); }

/** Token order: explicit option, DEED_PAGE_TOKEN, DEEDPAGE_TOKEN, ~/.config/deed-page/token. */
function loadToken() {
  const env = process.env.DEED_PAGE_TOKEN || process.env.DEEDPAGE_TOKEN;
  if (env && env.trim()) return env.trim();
  try {
    const t = fs.readFileSync(tokenPath(), 'utf8').trim();
    return t || null;
  } catch (_) { return null; }
}

/** Save a newly minted token with directory mode 700 and file mode 600. Never overwrites with empty. */
function saveToken(token) {
  if (!token) return null;
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch (_) {}
  const p = tokenPath();
  fs.writeFileSync(p, token, { mode: 0o600 });
  fs.chmodSync(p, 0o600);
  return p;
}

function isTextFile(file, buf) {
  if (TEXT_EXT.has(path.extname(file).toLowerCase())) return true;
  return false;
}

/** Read a file or folder into a deed.page JSON file map: {"path": "text" | {"base64": "..."}} */
function collectFiles(target) {
  const st = fs.statSync(target);
  const files = {};
  const add = (abs, rel) => {
    const buf = fs.readFileSync(abs);
    files[rel.split(path.sep).join('/')] = isTextFile(abs, buf) ? buf.toString('utf8') : { base64: buf.toString('base64') };
  };
  if (st.isFile()) {
    const name = path.basename(target);
    add(target, /\.html?$/i.test(name) ? 'index.html' : name);
    return files;
  }
  if (!st.isDirectory()) throw new Error(`Not a file or folder: ${target}`);
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(ent.name)) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) continue; // the server rejects links anyway
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) add(abs, path.relative(target, abs));
    }
  };
  walk(target);
  if (!Object.keys(files).length) throw new Error(`No files found in ${target}`);
  return files;
}

class DeedPage {
  constructor(opts = {}) {
    this.base = (opts.baseUrl || process.env.DEED_PAGE_API || DEFAULT_BASE).replace(/\/+$/, '');
    this.token = opts.token !== undefined ? opts.token : loadToken();
    this.client = opts.client || `deed-page-npm/${VERSION}`;
    this.saveNewToken = opts.saveToken !== false;
  }

  async _request(method, urlPath, { body, headers = {}, auth = true } = {}) {
    const h = { 'X-Client': this.client, 'User-Agent': `deed-page-npm/${VERSION}`, Accept: 'application/json', ...headers };
    if (auth && this.token) h.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.base + urlPath, { method, headers: h, body });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
    if (!res.ok) {
      const msg = data.message_for_user || data.message || data.error || `HTTP ${res.status}`;
      throw new DeedPageError(msg, res.status, data);
    }
    return data;
  }

  /**
   * Publish a file, a folder, or an in-memory file map to https://{slug}.deed.page/.
   * Publishing again to the same slug with the same token updates it (a new version).
   */
  async publish(source, { slug, merge = false, spa = false, ttl, ref = 'npm', heardFrom } = {}) {
    if (!slug) throw new Error('slug is required');
    if (!SLUG_RE.test(slug)) throw new Error(`Invalid slug "${slug}": 1-63 lowercase letters, digits, hyphens; no leading/trailing hyphen`);
    const files = typeof source === 'string' ? collectFiles(source) : source;
    const payload = { slug, files };
    if (heardFrom && !this.token) payload.heard_from = heardFrom;
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body) > BODY_LIMIT) {
      throw new Error(`Upload is ${(Buffer.byteLength(body) / 1e6).toFixed(1)} MB, over the 4 MB per-request cap. Use the manifest upload: https://deed.page/docs`);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (merge) headers['X-Merge'] = '1';
    if (spa) headers['X-Spa'] = '1';
    if (ttl) headers['X-Ttl'] = String(ttl);
    const data = await this._request('POST', `/v1/sites?ref=${encodeURIComponent(ref)}`, { body, headers });
    if (data.token) {
      const minted = data.token;
      this.token = minted;
      data.token_saved_to = this.saveNewToken ? saveToken(minted) : null;
      if (!this.saveNewToken) Object.defineProperty(data, 'newToken', { value: minted, enumerable: false });
      data.token = '<saved>';
    }
    return data;
  }

  /** Update a site you own. Same as publish, but refuses to run without a token. */
  async update(source, opts = {}) {
    if (!this.token) throw new Error('No token found. Set DEED_PAGE_TOKEN or save it to ' + tokenPath());
    return this.publish(source, opts);
  }

  async list() { this._needToken(); return this._request('GET', '/v1/sites'); }
  async get(slug) { return this._request('GET', `/v1/sites/${encodeURIComponent(slug)}`); }
  async delete(slug) { this._needToken(); return this._request('DELETE', `/v1/sites/${encodeURIComponent(slug)}`); }
  async whoami() { this._needToken(); return this._request('GET', '/v1/whoami'); }

  _needToken() {
    if (!this.token) throw new Error('No token found. Set DEED_PAGE_TOKEN or save it to ' + tokenPath());
  }
}

/** Replace any deed_tok_ value in an object or string so it is never printed. */
function redact(value) {
  return JSON.parse(JSON.stringify(value).replace(/deed_tok_[A-Za-z0-9_\-]+/g, '<redacted>'));
}

module.exports = { DeedPage, DeedPageError, collectFiles, loadToken, saveToken, tokenPath, redact, VERSION };
