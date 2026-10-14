import fs from 'node:fs';
const path = 'android-wrapper/app/src/main/AndroidManifest.xml';
let source = fs.readFileSync(path, 'utf8');
source = source.replace(/<intent-filter>[\s\S]*?<\/intent-filter>/g, block => {
  if (!block.includes('android.intent.action.SEND"')) return block;
  return block.replace(/ android:scheme="content"/g, '');
});
if (!source.includes('android.intent.action.SEND_MULTIPLE')) {
  const blocks = [...source.matchAll(/<intent-filter>[\s\S]*?<\/intent-filter>/g)].map(m=>m[0]).filter(b=>b.includes('android.intent.action.SEND"'));
  if (blocks.length !== 2) throw Error('Expected exactly PDF/octet-stream SEND filters');
  source = source.replace(blocks[1], blocks[1] + '\n            ' + blocks.map(b=>b.replace('android.intent.action.SEND"','android.intent.action.SEND_MULTIPLE"')).join('\n            '));
}
fs.writeFileSync(path, source);
