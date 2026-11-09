import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the actual Home heading JSX, not a second handwritten placement.
// The rest of Home (channel status, roster sync and providers) is not mounted.
export function conciergeHeaderFixturePlugin() {
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  const start = home.indexOf('function TelegramConciergeView(');
  assert(start >= 0);
  const heading = home.slice(start).match(/<section className="cz-panel-head"><div className="cc-concierge-heading">[\s\S]*?<\/section>/)?.[0];
  assert(heading, 'Actual Concierge header must contain the shared contact');
  assert.equal((heading.match(/<EscalaContactButton\/>/g) || []).length, 1);
  return { name: 'actual-concierge-contact-heading', setup(build) {
    build.onLoad({ filter: /[\\/]fixtures[\\/]escala-contact-app\.tsx$/ }, args => {
      const source = fs.readFileSync(args.path, 'utf8');
      const marker = '<h1>Contato de teste</h1><EscalaContactButton/>';
      assert.equal(source.split(marker).length, 2);
      return { contents: source.replace(marker, heading), loader: 'tsx' };
    });
  } };
}
