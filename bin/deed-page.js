#!/usr/bin/env node
'use strict';
const { DeedPage, DeedPageError, tokenPath, redact, VERSION } = require('../lib/index.js');

const HELP = `deed-page ${VERSION} - publish files to a permanent https://{slug}.deed.page/ URL

Usage:
  deed-page publish <file-or-folder> --slug <slug> [--merge] [--spa] [--ttl <seconds>]
  deed-page update  <file-or-folder> --slug <slug> [--merge] [--spa]
  deed-page list
  deed-page delete <slug>
  deed-page whoami

Options:
  --json        Print the raw JSON response (tokens are always redacted)
  --client <n>  X-Client name sent to deed.page (default deed-page-npm/${VERSION})
  -h, --help    Show this help      -v, --version   Show the version

Token: read from DEED_PAGE_TOKEN (or DEEDPAGE_TOKEN), else ${tokenPath()}.
The first publish without a token creates one and saves it there (mode 600).
The token is never printed. Docs: https://deed.page/docs
`;

function parse(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.flags.help = true;
    else if (a === '-v' || a === '--version') out.flags.version = true;
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (['merge', 'spa', 'json'].includes(k)) out.flags[k] = true;
      else out.flags[k] = v !== undefined ? v : argv[++i];
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const { _, flags } = parse(process.argv.slice(2));
  if (flags.version) return console.log(VERSION);
  const [cmd, arg] = _;
  if (!cmd || flags.help) return console.log(HELP);
  const dp = new DeedPage({ client: flags.client });
  const print = (data, line) => console.log(flags.json ? JSON.stringify(redact(data), null, 2) : line);
  switch (cmd) {
    case 'publish':
    case 'update': {
      if (!arg || !flags.slug) throw new Error(`Usage: deed-page ${cmd} <file-or-folder> --slug <slug>`);
      const fn = cmd === 'update' ? 'update' : 'publish';
      const r = await dp[fn](arg, { slug: flags.slug, merge: flags.merge, spa: flags.spa, ttl: flags.ttl });
      let line = `${r.url}  (version ${r.version})`;
      if (r.token_saved_to) line += `\nNew owner token saved to ${r.token_saved_to}. Keep it private: it is the only key to update or delete this site.`;
      if (r.token_saved_to && r.badge && r.badge.shown) line += `\nFree sites show a small "Published with deed.page" badge. Remove it: ${r.badge.upgrade_url || 'https://deed.page/pricing'}`;
      return print(r, line);
    }
    case 'list': {
      const r = await dp.list();
      const sites = r.sites || r.items || (Array.isArray(r) ? r : []);
      if (flags.json) return print(r);
      if (!sites.length) return console.log('No sites.');
      for (const s of sites) console.log(`${s.slug}\t${s.url || `https://${s.slug}.deed.page/`}\t${s.version || ''}`);
      return;
    }
    case 'delete': {
      if (!arg) throw new Error('Usage: deed-page delete <slug>');
      const r = await dp.delete(arg);
      return print(r, `Deleted ${arg}`);
    }
    case 'whoami': {
      const r = await dp.whoami();
      const plan = (r.plan && (r.plan.name || r.plan.id)) || r.stripe_plan || 'unknown';
      return print(r, `plan: ${plan}  sites: ${r.sites ?? '?'}/${r.site_limit ?? '?'}  domains: ${r.domains ?? '?'}/${r.domain_limit ?? '?'}`);
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run deed-page --help`);
  }
}

main().catch((err) => {
  const msg = String(err && err.message || err).replace(/deed_tok_[A-Za-z0-9_\-]+/g, '<redacted>');
  console.error(`deed-page: ${msg}${err instanceof DeedPageError ? ` (HTTP ${err.status}${err.code ? ' ' + err.code : ''})` : ''}`);
  process.exit(1);
});
