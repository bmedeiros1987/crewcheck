import fs from 'node:fs';

const helper = fs.readFileSync(
  'android-wrapper/wear/src/main/java/com/crewcheck/watch/WearUiCompliance.java',
  'utf8'
);
const backdrop = fs.readFileSync(
  'android-wrapper/wear/src/main/java/com/crewcheck/watch/PremiumBackdropView.java',
  'utf8'
);
const main = fs.readFileSync(
  'android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java',
  'utf8'
);

const required = [
  'static final float MIN_SECONDARY_SP = 10f;',
  'static final float MIN_ESSENTIAL_SP = 12f;',
  'static final int MIN_TOUCH_DP = 48;',
  'view.isClickable()',
  'view.getTypeface().isBold()',
  'view.setTextSize(TypedValue.COMPLEX_UNIT_SP, minimumSp);',
  'view.setMinimumWidth(minimumPx);',
  'view.setMinimumHeight(minimumPx);',
  'new InsetDrawable(',
  'parent.setMinimumHeight(minimumPx);',
  'hierarchySignature(root)',
];

for (const token of required) {
  if (!helper.includes(token)) {
    throw new Error(`Wear accessibility pass 11 missing: ${token}`);
  }
}

const backdropRequired = [
  'private final WearUiCompliance uiCompliance = new WearUiCompliance();',
  'ViewTreeObserver.OnGlobalLayoutListener',
  'uiCompliance.applyIfNeeded(this)',
  'addOnGlobalLayoutListener(complianceLayoutListener)',
  'removeOnGlobalLayoutListener(complianceLayoutListener)',
];
for (const token of backdropRequired) {
  if (!backdrop.includes(token)) {
    throw new Error(`Wear accessibility pass 11 backdrop hook missing: ${token}`);
  }
}

const forbiddenHelper = [
  'WatchContextSnapshot',
  'SecureSnapshotStore',
  'WatchSyncClient',
  'journeyId',
  'presentationTime',
  'premiumAccess',
  'HttpURLConnection',
  'SharedPreferences',
];
for (const token of forbiddenHelper) {
  if (helper.includes(token)) {
    throw new Error(`Wear accessibility pass 11 must remain presentation-only: ${token}`);
  }
}

if (!main.includes('scroll.setVerticalScrollBarEnabled(true);')) {
  throw new Error('Pass 11 must preserve the Play scrollbar fix from pass 10');
}
if (!backdrop.includes('private static final int BASE = Color.BLACK;')) {
  throw new Error('Pass 11 must preserve the true-black Wear canvas');
}

console.log('UI Lab Wear accessibility pass 11: PASS');
