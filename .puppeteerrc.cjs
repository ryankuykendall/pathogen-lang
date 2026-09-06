// Puppeteer install-time config (read by its postinstall via cosmiconfig).
//
// Puppeteer is a devDependency used by `--png` / `--render-gpu` and the
// verification scripts, so developer machines need its Chrome. The Cloudflare
// Pages build also runs `npm clean-install` with devDependencies, but only ever
// runs `npm run build:website`, which never launches a browser — downloading
// ~150 MB of Chrome there is pure waste. Pages injects CF_PAGES=1 into every
// build, so key the skip on that instead of a dashboard variable.
module.exports = {
  skipDownload: !!process.env.CF_PAGES,
};
