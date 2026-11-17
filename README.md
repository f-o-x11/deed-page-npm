# deed-page

The official [deed.page](https://deed.page) CLI and Node.js client. Publish a file or a folder to a permanent `https://{slug}.deed.page/` URL. You don't need an account, an email address or a claim link, and nothing expires after 24 hours.

## Quickstart

```bash
npx deed-page publish ./site --slug my-launch-7f3k
# https://my-launch-7f3k.deed.page/  (version v1)
# New owner token saved to ~/.config/deed-page/token
```

To update the site, run the same command again. Every publish is saved as a new version:

```bash
npx deed-page update ./site --slug my-launch-7f3k
npx deed-page list
npx deed-page delete my-launch-7f3k
```

Or install it globally with `npm i -g deed-page` and run `deed-page --help`. It needs Node.js 18 or later and has no dependencies.

## Token

The first publish without a token creates an owner token. The CLI saves it to `~/.config/deed-page/token` (directory mode 700, file mode 600) and never prints it. Later commands read the token from:

1. `DEED_PAGE_TOKEN` (or `DEEDPAGE_TOKEN`)
2. `~/.config/deed-page/token` (`$XDG_CONFIG_HOME/deed-page/token` if that is set)

The token is the only key that can update or delete your sites. deed.page stores only its SHA-256 hash. To manage billing or attach an optional recovery email, open https://deed.page/account.

## Commands

| Command | What it does |
| --- | --- |
| `publish <path> --slug <slug>` | Publishes a file or folder. A single `.html` file becomes `index.html`. |
| `update <path> --slug <slug>` | Same as `publish`, but fails if no token is found. |
| `list` | Lists the sites you own. |
| `delete <slug>` | Deletes a site you own. |
| `whoami` | Shows your plan and usage. |

Options: `--merge` replaces only the paths you send, `--spa` turns on single-page-app routing, `--ttl <seconds>` makes the site expire, and `--json` prints the raw response with tokens redacted.

## Library

```js
const { DeedPage } = require('deed-page');

const dp = new DeedPage(); // reads DEED_PAGE_TOKEN or ~/.config/deed-page/token
const site = await dp.publish('./dist', { slug: 'my-launch-7f3k' });
console.log(site.url);

// Files held in memory work too:
await dp.publish({ 'index.html': '<!doctype html><h1>Hi</h1>' }, { slug: 'my-launch-7f3k' });
await dp.delete('my-launch-7f3k');
```

## Limits

The Free plan gives you 25 sites, 25 MB per site and 60 publishes an hour. Free sites show a small "Published with deed.page" badge. Each request is capped at 4 MB, and this CLI refuses larger uploads before sending them. For bigger sites, use the manifest upload in the [docs](https://deed.page/docs). Plans and prices are at https://deed.page/pricing.

## License

MIT © Avatar 8 LLC. Support: ops@avatar33.com
