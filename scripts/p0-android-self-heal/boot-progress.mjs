import fs from 'node:fs';

const file = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
if (!fs.existsSync(file)) throw new Error(`[p0-android-self-heal:boot-progress] arquivo ausente: ${file}`);

let source = fs.readFileSync(file, 'utf8');

function replaceOnce(anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`[p0-android-self-heal:boot-progress] âncora ausente: ${label}`);
  source = source.replace(anchor, replacement);
}

if (!source.includes('CREWCHECK_FAST_REVEAL_DELAY_MS')) {
  replaceOnce(
    '    private static final long CREWCHECK_SHELL_WATCHDOG_DELAY_MS = 3200L;\n',
    '    private static final long CREWCHECK_SHELL_WATCHDOG_DELAY_MS = 3200L;\n' +
      '    private static final long CREWCHECK_FAST_REVEAL_DELAY_MS = 160L;\n',
    'constante de fast reveal',
  );
}

if (!source.includes('private LinearLayout crewCheckBootOverlay;')) {
  replaceOnce(
    '    private TextView crewCheckBootStatusText;\n',
    '    private LinearLayout crewCheckBootOverlay;\n' +
      '    private TextView crewCheckBootStatusText;\n' +
      '    private TextView crewCheckBootDetailText;\n',
    'campos do overlay premium',
  );
}

const showStart = source.indexOf('    private void showCrewCheckBootStatus(final String message) {');
const scheduleStart = source.indexOf('    private void scheduleCrewCheckShellWatchdog(final WebView target, final int generation) {', showStart);
if (showStart < 0 || scheduleStart < 0) {
  throw new Error('[p0-android-self-heal:boot-progress] métodos de boot canônicos não localizados.');
}

const premiumOverlayMethods = `    private void showCrewCheckBootStatus(final String message) {
        runOnUiThread(() -> {
            try {
                if (rootLayout == null) return;
                if (crewCheckBootOverlay == null) {
                    LinearLayout overlay = new LinearLayout(MainActivity.this);
                    overlay.setOrientation(LinearLayout.VERTICAL);
                    overlay.setGravity(Gravity.CENTER);
                    overlay.setPadding(dp(30), dp(36), dp(30), dp(36));
                    overlay.setBackgroundColor(Color.parseColor("#061426"));

                    android.widget.ImageView brand = new android.widget.ImageView(MainActivity.this);
                    brand.setImageResource(R.drawable.crewcheck_icon_site);
                    brand.setContentDescription("CrewCheck");
                    brand.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
                    LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(dp(82), dp(82));
                    brandParams.setMargins(0, 0, 0, dp(14));
                    overlay.addView(brand, brandParams);

                    TextView brandName = new TextView(MainActivity.this);
                    brandName.setText("CrewCheck");
                    brandName.setTextColor(Color.WHITE);
                    brandName.setTextSize(29f);
                    brandName.setGravity(Gravity.CENTER);
                    brandName.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    LinearLayout.LayoutParams brandNameParams = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                    );
                    brandNameParams.setMargins(0, 0, 0, dp(22));
                    overlay.addView(brandName, brandNameParams);

                    android.widget.ProgressBar progress = new android.widget.ProgressBar(MainActivity.this);
                    progress.setIndeterminate(true);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        progress.setIndeterminateTintList(
                                android.content.res.ColorStateList.valueOf(Color.parseColor("#22D3EE"))
                        );
                    }
                    LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(38), dp(38));
                    progressParams.setMargins(0, 0, 0, dp(18));
                    overlay.addView(progress, progressParams);

                    TextView status = new TextView(MainActivity.this);
                    status.setTextColor(Color.WHITE);
                    status.setTextSize(18f);
                    status.setGravity(Gravity.CENTER);
                    status.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    status.setPadding(dp(8), 0, dp(8), 0);
                    overlay.addView(status, new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                    ));

                    TextView detail = new TextView(MainActivity.this);
                    detail.setTextColor(Color.parseColor("#9EC1D8"));
                    detail.setTextSize(13f);
                    detail.setGravity(Gravity.CENTER);
                    detail.setPadding(dp(14), dp(8), dp(14), 0);
                    LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                    );
                    detailParams.setMargins(0, 0, 0, dp(24));
                    overlay.addView(detail, detailParams);

                    TextView safety = new TextView(MainActivity.this);
                    safety.setText("Carregamento seguro · isso leva só alguns segundos");
                    safety.setTextColor(Color.parseColor("#6F93AD"));
                    safety.setTextSize(11f);
                    safety.setGravity(Gravity.CENTER);
                    overlay.addView(safety, new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                    ));

                    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT
                    );
                    rootLayout.addView(overlay, params);
                    crewCheckBootOverlay = overlay;
                    crewCheckBootStatusText = status;
                    crewCheckBootDetailText = detail;
                }

                boolean opening = message == null || message.startsWith("Abrindo");
                crewCheckBootStatusText.setText(
                        opening ? "Entrando no CrewCheck" : message
                );
                crewCheckBootDetailText.setText(
                        opening
                                ? "Sincronizando sua escala e preparando sua experiência."
                                : "Recuperando a interface sem apagar login, escala ou preferências."
                );
                crewCheckBootOverlay.setVisibility(View.VISIBLE);
                crewCheckBootOverlay.bringToFront();
            } catch (Exception ignored) {}
        });
    }

    private void hideCrewCheckBootStatus() {
        runOnUiThread(() -> {
            try {
                if (crewCheckBootOverlay != null) crewCheckBootOverlay.setVisibility(View.GONE);
            } catch (Exception ignored) {}
        });
    }

`;

source = source.slice(0, showStart) + premiumOverlayMethods + source.slice(scheduleStart);

const newScheduleStart = source.indexOf('    private void scheduleCrewCheckShellWatchdog(final WebView target, final int generation) {');
const verifyStart = source.indexOf('    private void verifyCrewCheckShellMounted(final WebView target, final int generation) {', newScheduleStart);
if (newScheduleStart < 0 || verifyStart < 0) {
  throw new Error('[p0-android-self-heal:boot-progress] schedule/watchdog não localizados após overlay.');
}

const fastRevealMethods = `    private void scheduleCrewCheckShellWatchdog(final WebView target, final int generation) {
        if (target == null) return;
        target.postDelayed(() -> probeCrewCheckShellAndHideIfMounted(target, generation), CREWCHECK_FAST_REVEAL_DELAY_MS);
        target.postDelayed(() -> probeCrewCheckShellAndHideIfMounted(target, generation), 400L);
        target.postDelayed(() -> probeCrewCheckShellAndHideIfMounted(target, generation), 800L);
        target.postDelayed(() -> probeCrewCheckShellAndHideIfMounted(target, generation), 1400L);
        target.postDelayed(() -> probeCrewCheckShellAndHideIfMounted(target, generation), 2200L);
        target.postDelayed(() -> probeCrewCheckShellAndHideIfMounted(target, generation), 3000L);
        target.postDelayed(
                () -> verifyCrewCheckShellMounted(target, generation),
                CREWCHECK_SHELL_WATCHDOG_DELAY_MS
        );
    }

    private void probeCrewCheckShellAndHideIfMounted(final WebView target, final int generation) {
        if (target == null || target != webView || generation != crewCheckPageGeneration) return;
        final String probe = "(function(){try{" +
                "var root=document.getElementById('root');" +
                "var text=((document.body&&document.body.innerText)||'').trim();" +
                "return !!(root&&root.children&&root.children.length>0&&text.length>8);" +
                "}catch(e){return false;}})();";
        try {
            target.evaluateJavascript(probe, value -> {
                if (target != webView || generation != crewCheckPageGeneration) return;
                if (!"true".equalsIgnoreCase(String.valueOf(value))) return;
                crewCheckShellRecoveryAttempts = 0;
                try { target.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT); } catch (Exception ignored) {}
                hideCrewCheckBootStatus();
            });
        } catch (Exception ignored) {
            // Fast reveal is observational only. The existing 3.2 s watchdog
            // remains the single authority that may trigger recovery.
        }
    }

`;

source = source.slice(0, newScheduleStart) + fastRevealMethods + source.slice(verifyStart);

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-android-self-heal:boot-progress] overlay premium + fast reveal não destrutivo aplicados.');
