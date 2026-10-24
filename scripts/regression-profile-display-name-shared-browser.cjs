const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');

(async () => {
  // Both clients and browser storage/locks are real. Only the HTTP backend is synthetic.
  const bundle = await require('esbuild').build({
    stdin: { contents: "import * as client from './client/src/lib/platformClient';window.profileClient=client;document.body.textContent='Synthetic profile concurrency';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife',
  });
  const user = { id: 'synthetic-a', email: 'a@example.invalid', name: 'Login A' };
  const initial = { email: user.email, publicId: 'CC-A', displayName: 'Old Name', locale: 'en-US', timezone: 'UTC', plan: 'free', sharePresence: false };
  const KEY = 'crewcheck_platform_profile_cache_v2';
  let remote, requests, holdAt, pending;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/bundle.js') return res.end(bundle.outputFiles[0].contents);
    if (req.url !== '/api/platform/profile') {
      res.setHeader('content-type', 'text/html');
      return res.end('<html><body><script src="/bundle.js"></script></body></html>');
    }
    requests++;
    const number = requests;
    if (req.method === 'PATCH') {
      let body = ''; for await (const chunk of req) body += chunk;
      const patch = JSON.parse(body);
      assert.deepEqual(Object.keys(patch), ['displayName']);
      remote = { ...remote, ...patch };
    }
    const response = JSON.stringify({ ok: true, profile: { ...remote }, billing: { plan: 'free' } });
    const answer = () => { res.setHeader('content-type', 'application/json'); res.end(response); };
    if (number === holdAt) pending = answer;
    else answer();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
  try {
    for (const mode of ['cross-tab-old-get', 'same-tab-old-confirmed-save', 'cross-tab-locked-cache-read']) {
      remote = { ...initial }; requests = 0; pending = null; holdAt = mode === 'cross-tab-old-get' ? 1 : mode === 'cross-tab-locked-cache-read' ? 2 : 3;
      const context = await browser.newContext({ serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.addInitScript(({ user, initial, KEY }) => {
        localStorage.setItem('crewcheck_auth_user', JSON.stringify(user));
        localStorage.setItem('crewcheck_auth_token', 'synthetic-placeholder');
        if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(initial));
      }, { user, initial, KEY });
      const first = await context.newPage(); await first.goto(origin);
      assert.equal(await first.evaluate(() => typeof navigator.locks?.request), 'function');
      const second = mode.startsWith('cross-tab') ? await context.newPage() : first;
      if (second !== first) await second.goto(origin);
      await first.evaluate(mode => {
        window.pendingProfile = mode.startsWith('cross-tab') ? window.profileClient.getPlatformProfile() : window.profileClient.saveConfirmedDisplayName('Earlier Name');
      }, mode);
      const deadline = Date.now() + 10000;
      while (!pending && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(pending, 'the older server snapshot is held before the newer save');
      let saved;
      if (mode === 'cross-tab-locked-cache-read') {
        await second.evaluate(() => { window.newSaveDone = false; window.newSave = window.profileClient.saveConfirmedDisplayName('Latest Confirmed Name').then(result => { window.newSaveDone = true; return result; }); });
        const until = Date.now() + 10000;
        while (requests < 5 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(requests, 5, 'new cache refresh cannot enter while another tab holds the cache lock');
        assert.equal(await second.evaluate(() => window.newSaveDone), false);
        pending();
        saved = await second.evaluate(() => window.newSave);
      } else saved = await second.evaluate(() => window.profileClient.saveConfirmedDisplayName('Latest Confirmed Name'));
      assert.equal(saved.displayName, 'Latest Confirmed Name');
      if (mode !== 'cross-tab-locked-cache-read') pending();
      await first.evaluate(() => window.pendingProfile);
      await context.setOffline(true);
      const loaded = await second.evaluate(() => window.profileClient.getPlatformProfile());
      assert.equal(loaded.localOnly, true);
      assert.equal(loaded.profile.displayName, 'Latest Confirmed Name', mode);
      assert.equal(remote.displayName, 'Latest Confirmed Name', mode);
      console.log('PASS native Web Locks + real auth/platform clients: ' + mode);
      await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
