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
      '    private static final long CREWCHECK_FAST_REVEAL_DELAY_MS = 160L;\n' +
      '    private static final long CREWCHECK_PROGRESS_DELAY_MS = 900L;\n',
    'constantes do fast reveal/progresso',
  );
}

if (!source.includes('private LinearLayout crewCheckBootOverlay;')) {
  replaceOnce(
    '    private TextView crewCheckBootStatusText;\n',
    '    private LinearLayout crewCheckBootOverlay;\n' +
      '    private android.widget.ProgressBar crewCheckBootProgress;\n' +
      '    private TextView crewCheckBootStatusText;\n',
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
                    overlay.setPadding(dp(24), dp(28), dp(24), dp(28));
                    // O fundo replica o canto da nova marca para não criar um
                    // quadrado visível ao redor do PNG.
                    overlay.setBackgroundColor(Color.parseColor("#00010E"));

                    android.widget.ImageView brand = new android.widget.ImageView(MainActivity.this);
                    brand.setImageResource(R.drawable.crewcheck_logo_neon);
                    brand.setContentDescription("CrewCheck");
                    brand.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
                    LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(dp(168), dp(168));
                    brandParams.setMargins(0, 0, 0, dp(18));
                    overlay.addView(brand, brandParams);

                    android.widget.ProgressBar progress = new android.widget.ProgressBar(
                            MainActivity.this,
                            null,
                            android.R.attr.progressBarStyleHorizontal
                    );
                    progress.setIndeterminate(true);
                    progress.setVisibility(View.INVISIBLE);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        progress.setIndeterminateTintList(
                                android.content.res.ColorStateList.valueOf(Color.parseColor("#22D3EE"))
                        );
                        progress.setProgressBackgroundTintList(
                                android.content.res.ColorStateList.valueOf(Color.parseColor("#172554"))
                        );
                    }
                    LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(156), dp(4));
                    overlay.addView(progress, progressParams);

                    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT
                    );
                    rootLayout.addView(overlay, params);
                    crewCheckBootOverlay = overlay;
                    crewCheckBootProgress = progress;
                }

                crewCheckBootOverlay.setVisibility(View.VISIBLE);
                crewCheckBootOverlay.bringToFront();
                if (crewCheckBootProgress != null) {
                    crewCheckBootProgress.setVisibility(View.INVISIBLE);
                    crewCheckBootProgress.postDelayed(() -> {
                        try {
                            if (crewCheckBootOverlay != null
                                    && crewCheckBootOverlay.getVisibility() == View.VISIBLE
                                    && crewCheckBootProgress != null) {
                                crewCheckBootProgress.setVisibility(View.VISIBLE);
                            }
                        } catch (Exception ignored) {}
                    }, CREWCHECK_PROGRESS_DELAY_MS);
                }
            } catch (Exception ignored) {}
        });
    }

    private void hideCrewCheckBootStatus() {
        runOnUiThread(() -> {
            try {
                if (crewCheckBootProgress != null) {
                    crewCheckBootProgress.setVisibility(View.INVISIBLE);
                }
                if (crewCheckBootOverlay != null) {
                    crewCheckBootOverlay.setVisibility(View.GONE);
                }
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
console.log('[p0-android-self-heal:boot-progress] logo nova + barra tardia + fast reveal não destrutivo aplicados.');
