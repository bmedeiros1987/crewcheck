import fs from 'node:fs';

const mainPath = 'android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java';
const backdropPath = 'android-wrapper/wear/src/main/java/com/crewcheck/watch/PremiumBackdropView.java';

const main = fs.readFileSync(mainPath, 'utf8');
const backdrop = fs.readFileSync(backdropPath, 'utf8');

const requiredMain = [
  'scroll.setVerticalScrollBarEnabled(true);',
  'scroll.setScrollbarFadingEnabled(true);',
  'scroll.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);',
  'scroll.setVerticalScrollbarPosition(View.SCROLLBAR_POSITION_RIGHT);',
  'scroll.setScrollBarSize(dp(3));',
  'scroll.setScrollBarDefaultDelayBeforeFade(450);',
  'scroll.setScrollBarFadeDuration(650);',
  'root.setBackgroundColor(BLACK);',
  'content.getRootView().setBackgroundColor(BLACK);',
];

for (const token of requiredMain) {
  if (!main.includes(token)) {
    throw new Error(`Wear Play quality pass 10 missing: ${token}`);
  }
}

const forbiddenMain = [
  'setVerticalScrollBarEnabled(false)',
  'root.setBackgroundColor(ambient ? BLACK : NAVY)',
  'content.getRootView().setBackgroundColor(ambient ? BLACK : NAVY)',
  'PdfParser',
  'parseAimsTokensIntoEventsV3',
];

for (const token of forbiddenMain) {
  if (main.includes(token)) {
    throw new Error(`Wear Play quality pass 10 forbids: ${token}`);
  }
}

if (!backdrop.includes('private static final int BASE = Color.BLACK;')) {
  throw new Error('Wear Play quality pass 10 requires a true black backdrop base');
}

if (backdrop.includes('private static final int BASE = Color.rgb(3, 8, 20);')) {
  throw new Error('Legacy navy backdrop base must not return');
}

console.log('UI Lab Wear Play quality pass 10: PASS');
