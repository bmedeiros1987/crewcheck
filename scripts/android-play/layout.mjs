import fs from 'node:fs';

const update = (path, transform) => {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (before !== after) fs.writeFileSync(path, after);
};
fs.copyFileSync('scripts/android-play/layout.css', 'client/src/styles/android-store-layout.css');
update('client/src/main.tsx', source => {
  const line = "import './styles/android-store-layout.css';";
  if (source.includes(line)) return source;
  return source.replace('createRoot(document', `${line}\n\ncreateRoot(document`);
});
update('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java', source => {
  if (source.includes('// Accessible store controls')) return source;
  const patches = [
    ['TextView chip = text(label, 10, WHITE, true, Gravity.CENTER);', 'TextView chip = text(label, 12, WHITE, true, Gravity.CENTER);'],
    ['TextView chip = text(label, 9, selected ? WHITE : accent, true, Gravity.CENTER);', 'TextView chip = text(label, 12, selected ? WHITE : accent, true, Gravity.CENTER);'],
  ];
  for (const [before, after] of patches) {
    if (!source.includes(before)) throw new Error('Wear control anchor changed');
    source = source.replace(before, after + '\n        // Accessible store controls\n        chip.setMinHeight(dp(48));\n        chip.setMinWidth(dp(48));');
  }
  return source;
});
update('android-wrapper/watchface/src/main/res/raw/watchface.xml', source => source
  .replaceAll('color="#FF6E7C8F"', 'color="#FFA8B6C9"')
  .replaceAll('size="13" weight="NORMAL"', 'size="14" weight="NORMAL"'));
