package com.crewcheck.watch;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.wear.ambient.AmbientModeSupport;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * CrewWatch Official — glance-first CrewCheck para Wear OS.
 *
 * O relógio é consumidor da projeção canônica do celular: nunca interpreta PDF,
 * nunca recalcula APZ/jornada e nunca transforma bem-estar em diagnóstico.
 */
public final class MainActivity extends FragmentActivity
        implements AmbientModeSupport.AmbientCallbackProvider {

    private static final int MODE_NOW = 0;
    private static final int MODE_JOURNEY = 1;
    private static final int MODE_NOTIFICATIONS = 2;
    private static final int MODE_SCHEDULE = 3;
    private static final int MODE_CREWLIFE = 4;
    private static final int MODE_CONCIERGE = 5;
    private static final int PAGE_COUNT = 6;
    private static final int REQUEST_NOTIFICATIONS = 4102;
    private static final int REQUEST_CONCIERGE_SPEECH = 4103;
    public static final String ACTION_SNAPSHOT_UPDATED = "com.crewcheck.watch.SNAPSHOT_UPDATED";
    private static final long AUTO_SYNC_INTERVAL_MS = 2 * 60_000L;

    private static final int NAVY = Color.rgb(3, 10, 22);
    private static final int BLACK = Color.BLACK;
    private static final int SURFACE = Color.rgb(8, 22, 42);
    private static final int SURFACE_ALT = Color.rgb(11, 30, 57);
    private static final int WHITE = Color.rgb(248, 250, 252);
    private static final int MUTED = Color.rgb(153, 169, 194);
    private static final int MUTED_AMBIENT = Color.rgb(150, 150, 150);
    private static final int CYAN = Color.rgb(34, 211, 238);
    private static final int BLUE = Color.rgb(59, 130, 246);
    private static final int TEAL = Color.rgb(45, 212, 191);
    private static final int VIOLET = Color.rgb(139, 92, 246);
    private static final int MAGENTA = Color.rgb(236, 72, 153);
    private static final int SUCCESS = Color.rgb(52, 211, 153);
    private static final int WARNING = Color.rgb(251, 191, 36);
    private static final int ORANGE = Color.rgb(251, 146, 60);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final DateTimeFormatter clockFormatter =
            DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault());

    private final Runnable clockTick = new Runnable() {
        @Override
        public void run() {
            if (!ambient && clockView != null) {
                clockView.setText(LocalTime.now().format(clockFormatter));
                handler.postDelayed(this, 30_000L);
            }
        }
    };

    private final Runnable autoSyncTick = new Runnable() {
        @Override
        public void run() {
            if (!ambient) requestAutomaticSync();
            handler.postDelayed(this, AUTO_SYNC_INTERVAL_MS);
        }
    };

    private SecureSnapshotStore store;
    private WellbeingStore wellbeingStore;
    private WatchConciergeStore conciergeStore;
    private TextToSpeech conciergeTts;
    private boolean conciergeTtsReady;
    private String lastConciergeStatus = "Pronto para ajudar";
    private LinearLayout content;
    private TextView clockView;
    private TextView transientStatus;
    private boolean ambient;
    private int screenMode = MODE_NOW;
    private float touchDownX;
    private float touchDownY;
    private long lastRotaryNavigationAt;
    private boolean autoSyncInFlight;
    private String lastSyncStatus = "Sincronização automática ativa";
    private BroadcastReceiver snapshotUpdatedReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        store = new SecureSnapshotStore(this);
        wellbeingStore = new WellbeingStore(this);
        conciergeStore = new WatchConciergeStore(this);
        conciergeTts = new TextToSpeech(this, status -> {
            conciergeTtsReady = status == TextToSpeech.SUCCESS;
            if (conciergeTtsReady && conciergeTts != null) {
                conciergeTts.setLanguage(new Locale("pt", "BR"));
            }
        });
        AmbientModeSupport.attach(this);
        applyIntentScreen(getIntent());
        renderRoot();
        registerSnapshotUpdateReceiver();
        WatchAutoSyncScheduler.schedule(this);
        handler.postDelayed(this::requestNotificationPermissionIfNeeded, 850L);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIntentScreen(intent);
        renderSnapshot();
    }

    @Override
    protected void onResume() {
        super.onResume();
        restartClock();
        handler.removeCallbacks(autoSyncTick);
        handler.postDelayed(autoSyncTick, 350L);
        renderSnapshot();
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(clockTick);
        handler.removeCallbacks(autoSyncTick);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        unregisterSnapshotUpdateReceiver();
        if (conciergeTts != null) {
            try {
                conciergeTts.stop();
                conciergeTts.shutdown();
            } catch (Exception ignored) {}
            conciergeTts = null;
        }
        super.onDestroy();
    }

    @Override
    public AmbientModeSupport.AmbientCallback getAmbientCallback() {
        return new AmbientModeSupport.AmbientCallback() {
            @Override
            public void onEnterAmbient(Bundle ambientDetails) {
                ambient = true;
                screenMode = MODE_NOW;
                handler.removeCallbacks(clockTick);
                renderSnapshot();
            }

            @Override
            public void onExitAmbient() {
                ambient = false;
                renderSnapshot();
                restartClock();
            }

            @Override
            public void onUpdateAmbient() {
                if (ambient) renderSnapshot();
            }
        };
    }

    private void applyIntentScreen(Intent intent) {
        if (intent == null) return;
        String requested = intent.getStringExtra("crewcheck_screen");
        if ("journey".equals(requested)) screenMode = MODE_JOURNEY;
        else if ("notifications".equals(requested)) screenMode = MODE_NOTIFICATIONS;
        else if ("schedule".equals(requested)) screenMode = MODE_SCHEDULE;
        else if ("crewlife".equals(requested)) screenMode = MODE_CREWLIFE;
        else if ("concierge".equals(requested)) screenMode = MODE_CONCIERGE;
    }

    private void restartClock() {
        handler.removeCallbacks(clockTick);
        if (!ambient) handler.post(clockTick);
    }

    private void renderRoot() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(ambient ? BLACK : NAVY);

        PremiumBackdropView backdrop = new PremiumBackdropView(this);
        root.addView(backdrop, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.TRANSPARENT);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOnTouchListener((view, event) -> handleSwipeGesture(event));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        applySafePadding();

        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));
        root.addView(scroll, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        renderSnapshot();
    }

    private boolean handleSwipeGesture(MotionEvent event) {
        if (ambient) return false;
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            touchDownX = event.getX();
            touchDownY = event.getY();
            return false;
        }
        if (event.getActionMasked() == MotionEvent.ACTION_UP) {
            float dx = event.getX() - touchDownX;
            float dy = event.getY() - touchDownY;
            if (Math.abs(dx) >= dp(44) && Math.abs(dx) > Math.abs(dy) * 1.2f) {
                navigatePage(dx < 0 ? 1 : -1);
            }
        }
        return false;
    }

    @Override
    public boolean onGenericMotionEvent(MotionEvent event) {
        if (!ambient
                && event.getAction() == MotionEvent.ACTION_SCROLL
                && (event.getSource() & InputDevice.SOURCE_ROTARY_ENCODER)
                == InputDevice.SOURCE_ROTARY_ENCODER) {
            long now = System.currentTimeMillis();
            if (now - lastRotaryNavigationAt > 180L) {
                float delta = event.getAxisValue(MotionEvent.AXIS_SCROLL);
                if (Math.abs(delta) > 0.01f) {
                    navigatePage(delta < 0 ? 1 : -1);
                    lastRotaryNavigationAt = now;
                    return true;
                }
            }
        }
        return super.onGenericMotionEvent(event);
    }

    private void navigatePage(int delta) {
        int next = Math.max(0, Math.min(PAGE_COUNT - 1, screenMode + delta));
        if (next == screenMode) {
            if (content != null) content.performHapticFeedback(HapticFeedbackConstants.REJECT);
            return;
        }
        transitionToPage(next, delta);
    }

    private void transitionToPage(int nextMode, int direction) {
        screenMode = nextMode;
        if (content != null) content.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
        renderSnapshot();
        if (content != null) {
            content.setAlpha(0.35f);
            content.setTranslationX(dp(16) * (direction >= 0 ? 1 : -1));
            content.animate()
                    .alpha(1f)
                    .translationX(0f)
                    .setDuration(180L)
                    .start();
        }
    }

    private void applySafePadding() {
        int horizontal = isRoundScreen() ? dp(30) : dp(18);
        int topSafe = isRoundScreen() ? dp(18) : dp(10);
        int bottomSafe = isRoundScreen() ? dp(32) : dp(22);
        content.setPadding(horizontal, topSafe, horizontal, bottomSafe);
    }

    private void renderSnapshot() {
        if (content == null) return;

        content.removeAllViews();
        applySafePadding();
        content.getRootView().setBackgroundColor(ambient ? BLACK : NAVY);

        WatchContextSnapshot snapshot = store.load();
        long now = System.currentTimeMillis();

        if (ambient) {
            renderAmbient(snapshot, now);
            return;
        }

        renderHeader(snapshot);
        if (snapshot != null && !snapshot.premiumAccess) {
            renderPremiumGate();
            return;
        }
        addNavigation(snapshot);

        switch (screenMode) {
            case MODE_JOURNEY -> renderJourney(snapshot, now);
            case MODE_NOTIFICATIONS -> renderNotifications(snapshot, now);
            case MODE_SCHEDULE -> renderSchedule(snapshot, now);
            case MODE_CREWLIFE -> renderCrewLife(now);
            case MODE_CONCIERGE -> renderConcierge(now);
            default -> {
                if (snapshot == null) renderEmptyState();
                else renderLiveState(snapshot, now);
            }
        }

        renderFooter();

        if (BuildConfig.DEBUG) {
            TextView demo = text("Demonstração local", 8, MUTED, false, Gravity.CENTER);
            demo.setPadding(dp(8), dp(6), dp(8), dp(7));
            demo.setOnClickListener(view -> {
                long generated = System.currentTimeMillis();
                try {
                    store.save(WatchContextSnapshot.demo(generated).toJson().toString());
                    wellbeingStore.saveCrewLife(CrewLifeSnapshot.demo(generated).toJson().toString());
                    wellbeingStore.saveRoutine(RoutineSnapshot.demo(generated).toJson().toString());
                    screenMode = MODE_NOW;
                    renderSnapshot();
                } catch (Exception error) {
                    if (transientStatus != null) transientStatus.setText("Demo indisponível");
                }
            });
            content.addView(demo);
        }
    }

    private void renderHeader(WatchContextSnapshot snapshot) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.crewcheck_official);
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        row.addView(logo, new LinearLayout.LayoutParams(dp(21), dp(21)));

        TextView brand = text("CrewWatch", 10, MUTED, true, Gravity.START);
        brand.setPadding(dp(6), 0, 0, 0);
        row.addView(brand, new LinearLayout.LayoutParams(0, dp(24), 1f));

        int count = alertCount(snapshot);
        if (count > 0) {
            TextView badge = text(String.valueOf(count), 8, WHITE, true, Gravity.CENTER);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(MAGENTA);
            bg.setShape(GradientDrawable.OVAL);
            badge.setBackground(bg);
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(dp(20), dp(20));
            bp.setMargins(0, 0, dp(4), 0);
            row.addView(badge, bp);
            badge.setOnClickListener(view -> {
                screenMode = MODE_NOTIFICATIONS;
                renderSnapshot();
            });
        }

        TextView battery = text(batteryLabel(), 8, batteryAccent(), true, Gravity.END);
        battery.setContentDescription("Bateria do relógio " + batteryLabel());
        row.addView(battery, new LinearLayout.LayoutParams(dp(44), dp(24)));

        clockView = text(LocalTime.now().format(clockFormatter), 10, WHITE, true, Gravity.END);
        row.addView(clockView, new LinearLayout.LayoutParams(dp(42), dp(24)));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(26)
        );
        params.setMargins(dp(4), 0, dp(4), dp(7));
        content.addView(row, params);
    }

    private void renderAmbient(WatchContextSnapshot snapshot, long now) {
        content.setPadding(isRoundScreen() ? dp(42) : dp(28), dp(46),
                isRoundScreen() ? dp(42) : dp(28), dp(28));

        TextView time = text(LocalTime.now().format(clockFormatter), 38,
                WHITE, false, Gravity.CENTER);
        content.addView(time);

        if (snapshot == null || !snapshot.premiumAccess || snapshot.isStale(now)) {
            TextView hint = text("CrewCheck", 10, MUTED_AMBIENT, true, Gravity.CENTER);
            hint.setPadding(0, dp(8), 0, 0);
            content.addView(hint);
            return;
        }

        Primary primary = primaryFor(snapshot);
        TextView eyebrow = text(primary.eyebrow, 8, MUTED_AMBIENT, true, Gravity.CENTER);
        eyebrow.setPadding(0, dp(12), 0, dp(3));
        content.addView(eyebrow);

        TextView value = text(primary.value, primary.value.length() > 12 ? 18 : 22,
                WHITE, true, Gravity.CENTER);
        value.setMaxLines(2);
        content.addView(value);

        if (!snapshot.gateLabel().isBlank()) {
            TextView gate = text(snapshot.remoteStand ? "REMOTA" : snapshot.gateLabel(),
                    10, MUTED_AMBIENT, true, Gravity.CENTER);
            gate.setPadding(0, dp(8), 0, 0);
            content.addView(gate);
        }
    }

    private void renderPremiumGate() {
        TextView overline = text("CREWWATCH PREMIUM", 9, CYAN, true, Gravity.CENTER);
        overline.setLetterSpacing(.12f);
        overline.setPadding(0, dp(8), 0, dp(5));
        content.addView(overline);

        LinearLayout hero = premiumCard(VIOLET);
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(14), dp(13), dp(14), dp(13));

        TextView icon = text("✦", 24, CYAN, true, Gravity.CENTER);
        hero.addView(icon);

        TextView title = text("Sua operação no pulso", 20, WHITE, true, Gravity.CENTER);
        title.setMaxLines(2);
        title.setPadding(0, dp(3), 0, dp(3));
        hero.addView(title);

        TextView detail = text(
                "Agora, Jornada, Alertas, CrewLife e Concierge com sincronização automática do CrewCheck.",
                9, MUTED, false, Gravity.CENTER
        );
        detail.setMaxLines(4);
        detail.setPadding(dp(2), dp(3), dp(2), dp(3));
        hero.addView(detail);

        TextView access = text(
                "O Watch Face continua grátis. O aplicativo completo do relógio faz parte do Premium.",
                9, SUCCESS, true, Gravity.CENTER
        );
        access.setMaxLines(4);
        access.setPadding(dp(2), dp(5), dp(2), 0);
        hero.addView(access);
        content.addView(hero, cardParams());

        TextView refresh = heroAction("Validar assinatura", CYAN);
        refresh.setOnClickListener(view -> {
            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            requestSync();
        });
        content.addView(refresh);

        TextView hint = text(
                "Assine ou gerencie o Premium no CrewCheck do celular.",
                8, MUTED, false, Gravity.CENTER
        );
        hint.setMaxLines(2);
        hint.setPadding(0, dp(6), 0, dp(4));
        content.addView(hint);
    }

    private void renderEmptyState() {
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.crewcheck_official);
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        content.addView(logo, new LinearLayout.LayoutParams(dp(42), dp(42)));

        TextView title = text("CREWWATCH", 8, CYAN, true, Gravity.CENTER);
        title.setLetterSpacing(.12f);
        title.setPadding(0, dp(7), 0, dp(4));
        content.addView(title);

        TextView value = text("Pronto para sincronizar", 21, WHITE, true, Gravity.CENTER);
        value.setMaxLines(2);
        content.addView(value);

        TextView detail = text(
                "Abra o CrewCheck no celular uma vez. Depois, escala, próximos passos e alertas chegam automaticamente.",
                9, MUTED, false, Gravity.CENTER
        );
        detail.setMaxLines(4);
        detail.setPadding(dp(3), dp(6), dp(3), dp(8));
        content.addView(detail);

        TextView sync = heroAction("Sincronizar agora", CYAN);
        sync.setOnClickListener(view -> requestSync());
        content.addView(sync);
    }

    private void renderLiveState(WatchContextSnapshot snapshot, long now) {
        boolean stale = snapshot.isStale(now);
        Primary primary = primaryFor(snapshot);
        int accent = snapshot.changed ? MAGENTA : stale ? WARNING : primary.accent;

        View glow = new View(this);
        GradientDrawable glowBg = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(CYAN, 45), withAlpha(VIOLET, 120), withAlpha(MAGENTA, 45)}
        );
        glowBg.setCornerRadius(dp(28));
        glow.setBackground(glowBg);
        content.addView(glow, new LinearLayout.LayoutParams(dp(124), dp(3)));

        LinearLayout hero = premiumCard(accent);
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(13), dp(11), dp(13), dp(11));
        hero.setElevation(dp(2));

        TextView icon = text(stateGlyph(snapshot.state), 19, accent, true, Gravity.CENTER);
        hero.addView(icon);

        TextView eyebrow = text(
                stale ? "DADOS ANTIGOS" : primary.eyebrow,
                9, accent, true, Gravity.CENTER
        );
        eyebrow.setLetterSpacing(.10f);
        eyebrow.setPadding(0, dp(2), 0, 0);
        hero.addView(eyebrow);

        TextView value = text(
                stale ? "Confira no celular" : primary.value,
                stale ? 20 : (primary.value.length() > 14 ? 23 : 31),
                WHITE, true, Gravity.CENTER
        );
        value.setMaxLines(2);
        value.setPadding(0, dp(3), 0, 0);
        hero.addView(value);

        if (!primary.detail.isBlank()) {
            TextView detail = text(primary.detail, 11, stale ? WARNING : WHITE,
                    false, Gravity.CENTER);
            detail.setMaxLines(2);
            detail.setPadding(0, dp(4), 0, 0);
            hero.addView(detail);
        }

        if (!primary.secondary.isBlank()) {
            TextView secondary = text(primary.secondary, 9, MUTED, false, Gravity.CENTER);
            secondary.setPadding(0, dp(4), 0, 0);
            secondary.setMaxLines(2);
            hero.addView(secondary);
        }

        content.addView(hero, cardParams());

        List<Fact> facts = secondaryFacts(snapshot);
        if (!facts.isEmpty()) {
            LinearLayout stats = new LinearLayout(this);
            stats.setOrientation(LinearLayout.HORIZONTAL);
            stats.setGravity(Gravity.CENTER);
            addMiniStat(stats, facts.get(0));
            if (facts.size() > 1) addMiniStat(stats, facts.get(1));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            params.setMargins(0, dp(4), 0, dp(1));
            content.addView(stats, params);
        }

        addGlanceRail(snapshot, now);
        addProgramStrip(snapshot);

        TextView concierge = actionChip("✦ Concierge", MAGENTA, false);
        concierge.setOnClickListener(view -> transitionToPage(MODE_CONCIERGE, 1));
        content.addView(concierge);

        TextView cta = heroAction(actionLabel(snapshot), accent);
        cta.setOnClickListener(view -> {
            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            if ("LEAVE_SOON".equals(snapshot.state)) requestSync();
            else transitionToPage(MODE_JOURNEY, 1);
        });
        content.addView(cta);

        TextView freshness = text(snapshot.statusLabel(now), 8,
                stale ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(5), 0, 0);
        content.addView(freshness);
    }

    private void renderJourney(WatchContextSnapshot snapshot, long now) {
        TextView title = text("Sua jornada", 20, WHITE, true, Gravity.CENTER);
        title.setPadding(0, dp(2), 0, dp(2));
        content.addView(title);

        TextView subtitle = text("Do próximo passo ao pernoite", 9, MUTED, false, Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dp(6));
        content.addView(subtitle);

        if (snapshot == null || snapshot.isStale(now)) {
            LinearLayout empty = premiumCard(VIOLET);
            empty.setGravity(Gravity.CENTER_HORIZONTAL);
            empty.addView(text("Jornada ainda não disponível", 14, WHITE, true, Gravity.CENTER));
            TextView detail = text(
                    "Abra o CrewCheck no celular e sincronize. Assim que houver uma programação válida, ela aparece aqui.",
                    9, MUTED, false, Gravity.CENTER
            );
            detail.setPadding(0, dp(5), 0, 0);
            detail.setMaxLines(4);
            empty.addView(detail);
            content.addView(empty, cardParams());
            return;
        }

        Primary primary = primaryFor(snapshot);
        LinearLayout nowCard = premiumCard(primary.accent);
        nowCard.setGravity(Gravity.CENTER_HORIZONTAL);
        nowCard.setPadding(dp(12), dp(9), dp(12), dp(9));
        TextView nowLabel = text("AGORA · " + primary.eyebrow, 8, primary.accent, true, Gravity.CENTER);
        nowLabel.setLetterSpacing(.08f);
        nowCard.addView(nowLabel);
        TextView nowValue = text(primary.value, primary.value.length() > 15 ? 18 : 23,
                WHITE, true, Gravity.CENTER);
        nowValue.setPadding(0, dp(3), 0, 0);
        nowCard.addView(nowValue);
        String nowDetail = firstNonBlank(primary.detail, primary.secondary);
        if (!nowDetail.isBlank()) {
            TextView detail = text(nowDetail, 9, MUTED, false, Gravity.CENTER);
            detail.setPadding(0, dp(3), 0, 0);
            detail.setMaxLines(2);
            nowCard.addView(detail);
        }
        content.addView(nowCard, cardParams());

        TextView stepsTitle = text("PRÓXIMOS PASSOS", 8, VIOLET, true, Gravity.CENTER);
        stepsTitle.setLetterSpacing(.10f);
        stepsTitle.setPadding(0, dp(6), 0, dp(3));
        content.addView(stepsTitle);

        if (snapshot.schedule.isEmpty()) {
            TextView done = text("Nenhuma outra etapa programada.", 10, MUTED, false, Gravity.CENTER);
            done.setPadding(0, dp(8), 0, dp(8));
            content.addView(done);
            return;
        }

        int count = 0;
        for (WatchContextSnapshot.ScheduleItem item : snapshot.schedule) {
            if (count >= 4) break;
            addJourneyStep(item, count == 0);
            count++;
        }

        if (!snapshot.overnight.isBlank()) {
            TextView overnight = actionChip(
                    "☾ Pernoite · " + snapshot.overnight,
                    MAGENTA,
                    "OVERNIGHT".equals(snapshot.state)
            );
            content.addView(overnight);
        }
    }

    private void addJourneyStep(WatchContextSnapshot.ScheduleItem item, boolean current) {
        int accent = "stay".equals(item.kind) ? MAGENTA
                : "flight".equals(item.kind) ? CYAN
                : VIOLET;

        LinearLayout card = premiumCard(accent);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(9), dp(7), dp(9), dp(7));

        TextView time = text(item.time.isBlank() ? "•" : item.time, 11,
                current ? accent : MUTED, true, Gravity.CENTER);
        card.addView(time, new LinearLayout.LayoutParams(dp(50), dp(38)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setGravity(Gravity.CENTER_VERTICAL);

        String title = current ? "AGORA · " + item.title : item.title;
        TextView headline = text(title, 11, WHITE, true, Gravity.START);
        headline.setMaxLines(1);
        copy.addView(headline);

        String detailLine = join(" · ",
                item.route,
                item.presentation.isBlank() ? "" : "APZ " + item.presentation,
                item.gate
        );
        TextView detail = text(detailLine, 8, MUTED, false, Gravity.START);
        detail.setMaxLines(2);
        copy.addView(detail);

        card.addView(copy, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        ));
        content.addView(card, cardParams());
    }

    private void renderNotifications(WatchContextSnapshot snapshot, long now) {
        TextView title = text("NOTIFICAÇÕES", 10, CYAN, true, Gravity.CENTER);
        title.setLetterSpacing(.08f);
        title.setPadding(0, dp(4), 0, dp(5));
        content.addView(title);

        boolean enabled = WatchNotificationCenter.isEnabled(this);
        TextView state = heroAction(enabled ? "No relógio: ativadas" : "No relógio: pausadas",
                enabled ? SUCCESS : MUTED);
        state.setOnClickListener(view -> {
            boolean next = !WatchNotificationCenter.isEnabled(this);
            WatchNotificationCenter.setEnabled(this, next);
            if (next) requestNotificationPermissionIfNeeded();
            renderSnapshot();
        });
        content.addView(state);

        if (!notificationPermissionGranted()) {
            TextView permission = text(
                    "Permita notificações do CrewCheck para receber hora de sair, mudanças, embarque e conexão.",
                    9, WARNING, false, Gravity.CENTER
            );
            permission.setMaxLines(4);
            permission.setPadding(dp(4), dp(7), dp(4), dp(6));
            content.addView(permission);

            TextView allow = actionChip("Permitir notificações", WARNING, false);
            allow.setOnClickListener(view -> requestNotificationPermissionIfNeeded());
            content.addView(allow);
        }

        List<NotificationItem> items = currentNotifications(snapshot, now);
        if (items.isEmpty()) {
            LinearLayout empty = premiumCard(SUCCESS);
            empty.setGravity(Gravity.CENTER_HORIZONTAL);
            empty.setPadding(dp(12), dp(12), dp(12), dp(12));

            TextView check = text("✓", 22, SUCCESS, true, Gravity.CENTER);
            empty.addView(check);

            TextView emptyTitle = text("Tudo certo por aqui", 16, WHITE, true, Gravity.CENTER);
            emptyTitle.setPadding(0, dp(2), 0, dp(3));
            empty.addView(emptyTitle);

            TextView detail = text(
                    "Sem alertas importantes agora. Se algo mudar, o CrewCheck avisa no seu pulso.",
                    9, MUTED, false, Gravity.CENTER
            );
            detail.setMaxLines(3);
            empty.addView(detail);
            content.addView(empty, cardParams());
            return;
        }

        for (NotificationItem item : items) addNotificationCard(item);
    }

    private void renderCrewLife(long now) {
        TextView overline = text("CREWLIFE · OPCIONAL", 8, SUCCESS, true, Gravity.CENTER);
        overline.setLetterSpacing(.10f);
        overline.setPadding(0, dp(2), 0, dp(4));
        content.addView(overline);

        CrewLifeSnapshot life = wellbeingStore.loadCrewLife();
        RoutineSnapshot routine = wellbeingStore.loadRoutine();

        if (life == null || life.isStale(now)) {
            LinearLayout card = premiumCard(SUCCESS);
            card.setGravity(Gravity.CENTER_HORIZONTAL);
            card.setPadding(dp(12), dp(11), dp(12), dp(11));
            card.addView(text("Seu bem-estar, no seu ritmo", 18, WHITE, true, Gravity.CENTER));

            TextView detail = text(
                    "Sem registros no relógio ainda. No celular, ative “Mostrar CrewLife no relógio” e registre apenas o que quiser.",
                    9, MUTED, false, Gravity.CENTER
            );
            detail.setMaxLines(4);
            detail.setPadding(0, dp(5), 0, dp(5));
            card.addView(detail);

            TextView privacy = text("Manual · local · opcional", 8, SUCCESS, true, Gravity.CENTER);
            card.addView(privacy);
            content.addView(card, cardParams());
            return;
        }

        LinearLayout hero = premiumCard(SUCCESS);
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(12), dp(10), dp(12), dp(10));

        boolean hasRecovery = life.recoveryScore > 0
                || (!life.recoveryLabel.isBlank() && !"DESCONHECIDA".equals(life.recoveryLabel));

        TextView headline = text(crewLifeHero(life), 29, SUCCESS, true, Gravity.CENTER);
        hero.addView(headline);

        TextView label = text(
                life.isEnergyScore()
                        ? "Energy Score · Samsung Health"
                        : hasRecovery ? "Resumo de recuperação" : "Seu resumo no pulso",
                10, WHITE, true, Gravity.CENTER
        );
        label.setPadding(0, dp(2), 0, 0);
        hero.addView(label);
        content.addView(hero, cardParams());

        LinearLayout stats = new LinearLayout(this);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        stats.setGravity(Gravity.CENTER);
        addCrewLifeStat(stats, "SONO", sleepLabel(life), VIOLET);
        addCrewLifeStat(stats, "PASSOS", compactSteps(life.steps), CYAN);
        addCrewLifeStat(stats, "ATIVIDADE",
                life.activeMinutes > 0 ? life.activeMinutes + " min" : "--", SUCCESS);
        content.addView(stats, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        if (!life.recommendation.isBlank()
                && !"DESCONHECIDA".equalsIgnoreCase(life.recommendation)) {
            TextView recommendation = text(life.recommendation, 10, MAGENTA, true, Gravity.CENTER);
            recommendation.setPadding(0, dp(7), 0, dp(2));
            content.addView(recommendation);
        }

        if (routine != null && !routine.isStale(now)) {
            LinearLayout card = premiumCard(VIOLET);
            TextView rTitle = text("ROTINA · " + firstNonBlank(routine.title, "HOJE"),
                    8, VIOLET, true, Gravity.CENTER);
            rTitle.setLetterSpacing(.08f);
            card.addView(rTitle);
            TextView rValue = text(
                    routine.durationMinutes > 0 ? routine.durationMinutes + " min" : routine.nextAction,
                    18, WHITE, true, Gravity.CENTER
            );
            card.addView(rValue);
            TextView rDetail = text(firstNonBlank(routine.nextAction, routine.reason),
                    8, MUTED, false, Gravity.CENTER);
            rDetail.setMaxLines(2);
            card.addView(rDetail);
            content.addView(card, cardParams());
        }

        TextView privacy = text(
                "CrewLife é opcional. No relógio ficam apenas os resumos que você escolheu compartilhar.",
                8, MUTED, false, Gravity.CENTER
        );
        privacy.setMaxLines(3);
        privacy.setPadding(0, dp(6), 0, 0);
        content.addView(privacy);
    }

    private void renderConcierge(long now) {
        TextView overline = text("CONCIERGE · NO PULSO", 8, MAGENTA, true, Gravity.CENTER);
        overline.setLetterSpacing(.10f);
        overline.setPadding(0, dp(2), 0, dp(4));
        content.addView(overline);

        LinearLayout hero = premiumCard(MAGENTA);
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(12), dp(11), dp(12), dp(11));
        hero.addView(text("Como posso ajudar?", 20, WHITE, true, Gravity.CENTER));

        TextView detail = text(
                "Atalhos rápidos ou fale naturalmente. O celular encaminha ao mesmo Concierge do CrewCheck.",
                9, MUTED, false, Gravity.CENTER
        );
        detail.setMaxLines(4);
        detail.setPadding(0, dp(4), 0, 0);
        hero.addView(detail);
        content.addView(hero, cardParams());

        LinearLayout rowOne = navRow();
        addConciergeQuickAction(rowOne, "⏰ Despertar", "WAKEUP");
        addConciergeQuickAction(rowOne, "🚐 Transfer", "TRANSFER");
        content.addView(rowOne);

        LinearLayout rowTwo = navRow();
        addConciergeQuickAction(rowTwo, "⌂ Quarto", "ROOM");
        addConciergeQuickAction(rowTwo, "✈ Aeroporto", "AIRPORT");
        content.addView(rowTwo);

        LinearLayout rowThree = navRow();
        addConciergeQuickAction(rowThree, "☕ Alimentação", "FOOD");
        content.addView(rowThree);

        TextView voice = heroAction("🎙 Falar com Concierge", VIOLET);
        voice.setOnClickListener(view -> {
            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            startVoiceConcierge();
        });
        content.addView(voice);

        WatchConciergeStore.Snapshot latest = conciergeStore == null ? null : conciergeStore.load();
        if (latest != null && latest.isFresh(now)) {
            LinearLayout response = premiumCard(latest.ok ? CYAN : WARNING);
            response.setGravity(Gravity.CENTER_HORIZONTAL);

            TextView label = text(
                    latest.ok ? "RESPOSTA DO CONCIERGE" : "CONCIERGE",
                    8,
                    latest.ok ? CYAN : WARNING,
                    true,
                    Gravity.CENTER
            );
            label.setLetterSpacing(.08f);
            response.addView(label);

            TextView reply = text(
                    latest.reply.isBlank() ? latest.status : latest.reply,
                    11,
                    WHITE,
                    true,
                    Gravity.CENTER
            );
            reply.setMaxLines(6);
            reply.setPadding(0, dp(4), 0, 0);
            response.addView(reply);
            content.addView(response, cardParams());

            if (latest.ok && !latest.reply.isBlank()) {
                TextView listen = actionChip("🔊 Ouvir resposta", VIOLET, false);
                listen.setOnClickListener(view -> speakLatestConcierge());
                content.addView(listen);
            }
        } else {
            TextView empty = text(
                    "As respostas recentes aparecem aqui automaticamente.",
                    9, MUTED, false, Gravity.CENTER
            );
            empty.setPadding(dp(5), dp(7), dp(5), 0);
            content.addView(empty);
        }

        TextView status = text(lastConciergeStatus, 8,
                lastConciergeStatus.toLowerCase(Locale.ROOT).contains("não") ? WARNING : MUTED,
                false, Gravity.CENTER);
        status.setPadding(0, dp(6), 0, 0);
        content.addView(status);

        TextView privacy = text(
                "Privacidade: o relógio envia apenas sua ação ou fala transcrita. Credenciais e dados brutos de saúde não entram no pedido.",
                7, MUTED, false, Gravity.CENTER
        );
        privacy.setMaxLines(4);
        privacy.setPadding(dp(3), dp(5), dp(3), 0);
        content.addView(privacy);
    }

    private void addConciergeQuickAction(LinearLayout row, String label, String action) {
        TextView chip = actionChip(label, MAGENTA, false);
        chip.setOnClickListener(view -> {
            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            sendConciergeAction(action, "");
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        );
        params.setMargins(dp(2), dp(2), dp(2), 0);
        row.addView(chip, params);
    }

    private void sendConciergeAction(String action, String text) {
        lastConciergeStatus = "Enviando ao celular…";
        renderSnapshot();
        WatchConciergeClient.send(this, action, text, (sent, requestId, status) ->
                runOnUiThread(() -> {
                    lastConciergeStatus = status == null || status.isBlank()
                            ? (sent ? "Enviado · aguardando Concierge" : "Não foi possível enviar")
                            : status;
                    renderSnapshot();
                })
        );
    }

    private void startVoiceConcierge() {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            );
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Fale com o Concierge");
            if (intent.resolveActivity(getPackageManager()) == null) {
                lastConciergeStatus = "Reconhecimento de voz não disponível";
                renderSnapshot();
                return;
            }
            startActivityForResult(intent, REQUEST_CONCIERGE_SPEECH);
        } catch (Exception error) {
            lastConciergeStatus = "Não foi possível abrir o microfone";
            renderSnapshot();
        }
    }

    private void speakLatestConcierge() {
        WatchConciergeStore.Snapshot latest = conciergeStore == null ? null : conciergeStore.load();
        if (latest == null || latest.reply.isBlank()) {
            lastConciergeStatus = "Nenhuma resposta para ouvir";
            renderSnapshot();
            return;
        }
        if (!conciergeTtsReady || conciergeTts == null) {
            lastConciergeStatus = "Voz de resposta ainda não está pronta";
            renderSnapshot();
            return;
        }
        conciergeTts.speak(
                latest.reply,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "crewcheck-concierge-reply"
        );
        lastConciergeStatus = "Reproduzindo resposta";
        renderSnapshot();
    }

    private void renderSchedule(WatchContextSnapshot snapshot, long now) {
        TextView title = text("MINHA ESCALA", 10, CYAN, true, Gravity.CENTER);
        title.setLetterSpacing(.09f);
        title.setPadding(0, dp(3), 0, dp(2));
        content.addView(title);

        String scheduleSummary = snapshot == null || snapshot.schedule.isEmpty()
                ? "Próximos passos"
                : "Hoje · " + snapshot.schedule.size() + (snapshot.schedule.size() == 1 ? " etapa" : " etapas");
        TextView subtitle = text(scheduleSummary, 15, WHITE, true, Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dp(7));
        content.addView(subtitle);

        if (snapshot != null && !snapshot.isStale(now)) {
            Primary current = primaryFor(snapshot);
            LinearLayout currentCard = premiumCard(current.accent);
            currentCard.setGravity(Gravity.CENTER_HORIZONTAL);
            currentCard.setPadding(dp(10), dp(8), dp(10), dp(8));

            TextView currentLabel = text("ESCALA ATUAL · " + current.eyebrow,
                    7, current.accent, true, Gravity.CENTER);
            currentLabel.setLetterSpacing(.08f);
            currentCard.addView(currentLabel);

            TextView currentValue = text(current.value, current.value.length() > 14 ? 16 : 19,
                    WHITE, true, Gravity.CENTER);
            currentValue.setPadding(0, dp(2), 0, 0);
            currentCard.addView(currentValue);

            String currentDetail = firstNonBlank(current.detail, current.secondary);
            if (!currentDetail.isBlank()) {
                TextView detail = text(currentDetail, 8, MUTED, false, Gravity.CENTER);
                detail.setMaxLines(2);
                detail.setPadding(0, dp(2), 0, 0);
                currentCard.addView(detail);
            }
            content.addView(currentCard, cardParams());
        }

        if (snapshot == null || snapshot.schedule.isEmpty()) {
            LinearLayout empty = premiumCard(CYAN);
            empty.setGravity(Gravity.CENTER_HORIZONTAL);
            empty.setPadding(dp(12), dp(11), dp(12), dp(11));

            TextView emptyTitle = text("Sem programação agora", 16, WHITE, true, Gravity.CENTER);
            empty.addView(emptyTitle);

            TextView emptyDetail = text(
                    "Quando a escala chegar ao CrewCheck, ela aparece aqui automaticamente.",
                    9, MUTED, false, Gravity.CENTER
            );
            emptyDetail.setMaxLines(3);
            emptyDetail.setPadding(0, dp(4), 0, 0);
            empty.addView(emptyDetail);

            content.addView(empty, cardParams());
            return;
        }

        int count = 0;
        for (WatchContextSnapshot.ScheduleItem item : snapshot.schedule) {
            if (count >= 6) break;
            addScheduleItem(item, count == 0);
            count++;
        }

        TextView freshness = text(snapshot.statusLabel(now), 8,
                snapshot.isStale(now) ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(6), 0, 0);
        content.addView(freshness);
    }

    private void addScheduleItem(WatchContextSnapshot.ScheduleItem item, boolean first) {
        LinearLayout card = premiumCard(
                "stay".equals(item.kind) ? MAGENTA :
                "flight".equals(item.kind) ? CYAN : VIOLET
        );
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);

        int accent = "stay".equals(item.kind) ? MAGENTA
                : "flight".equals(item.kind) ? CYAN
                : VIOLET;

        TextView time = text(item.time.isBlank() ? "•" : item.time, 12,
                first ? accent : WHITE, true, Gravity.CENTER);
        card.addView(time, new LinearLayout.LayoutParams(dp(52), dp(42)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setGravity(Gravity.CENTER_VERTICAL);

        TextView headline = text(
                (first ? "AGORA · " : "") + item.title,
                12, WHITE, true, Gravity.START
        );
        headline.setMaxLines(1);
        copy.addView(headline);

        String route = join(" · ",
                item.route,
                item.presentation.isBlank() ? "" : "APZ " + item.presentation,
                item.gate.isBlank() ? "" : item.gate
        );
        TextView detail = text(route, 8, MUTED, false, Gravity.START);
        detail.setMaxLines(2);
        copy.addView(detail);

        card.addView(copy, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        content.addView(card, cardParams());
    }

    private void addNavigation(WatchContextSnapshot snapshot) {
        LinearLayout rail = new LinearLayout(this);
        rail.setOrientation(LinearLayout.HORIZONTAL);
        rail.setGravity(Gravity.CENTER_VERTICAL);
        rail.setPadding(dp(4), dp(3), dp(4), dp(3));

        GradientDrawable railBg = new GradientDrawable();
        railBg.setColor(withAlpha(SURFACE, 228));
        railBg.setCornerRadius(dp(22));
        railBg.setStroke(dp(1), withAlpha(pageAccent(), 105));
        rail.setBackground(railBg);

        final int previous = screenMode - 1;
        final int next = screenMode + 1;

        TextView left = navigationButton("‹", previous >= 0);
        if (previous >= 0) {
            left.setContentDescription("Ir para " + pageTitle(previous));
            left.setOnClickListener(view -> transitionToPage(previous, -1));
        }
        rail.addView(left, new LinearLayout.LayoutParams(dp(38), dp(36)));

        TextView selected = text(
                pageTitle() + "  " + (screenMode + 1) + "/" + PAGE_COUNT,
                9, WHITE, true, Gravity.CENTER
        );
        selected.setLetterSpacing(.05f);
        selected.setMinHeight(dp(36));
        GradientDrawable selectedBg = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(BLUE, 170), withAlpha(pageAccent(), 135)}
        );
        selectedBg.setCornerRadius(dp(19));
        selectedBg.setStroke(dp(1), withAlpha(CYAN, 105));
        selected.setBackground(selectedBg);
        selected.setContentDescription(
                "Tela " + (screenMode + 1) + " de " + PAGE_COUNT + ", " + pageTitle()
        );
        rail.addView(selected, new LinearLayout.LayoutParams(
                0, dp(36), 1f
        ));

        TextView right = navigationButton("›", next < PAGE_COUNT);
        if (next < PAGE_COUNT) {
            right.setContentDescription("Ir para " + pageTitle(next));
            right.setOnClickListener(view -> transitionToPage(next, 1));
        }
        rail.addView(right, new LinearLayout.LayoutParams(dp(38), dp(36)));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(42)
        );
        params.setMargins(0, 0, 0, dp(6));
        content.addView(rail, params);
    }

    private TextView navigationButton(String label, boolean enabled) {
        TextView button = text(label, 22, enabled ? WHITE : withAlpha(MUTED, 90),
                true, Gravity.CENTER);
        button.setEnabled(enabled);
        button.setMinWidth(dp(38));
        button.setMinHeight(dp(36));
        if (enabled) {
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(withAlpha(SURFACE_ALT, 170));
            bg.setCornerRadius(dp(18));
            button.setBackground(bg);
        }
        return button;
    }

    private String pageTitle() {
        return pageTitle(screenMode);
    }

    private static String pageTitle(int mode) {
        return switch (mode) {
            case MODE_JOURNEY -> "JORNADA";
            case MODE_NOTIFICATIONS -> "ALERTAS";
            case MODE_SCHEDULE -> "ESCALA";
            case MODE_CREWLIFE -> "CREWLIFE";
            case MODE_CONCIERGE -> "CONCIERGE";
            default -> "AGORA";
        };
    }

    private int pageAccent() {
        return switch (screenMode) {
            case MODE_JOURNEY -> VIOLET;
            case MODE_NOTIFICATIONS -> MAGENTA;
            case MODE_SCHEDULE -> CYAN;
            case MODE_CREWLIFE -> SUCCESS;
            case MODE_CONCIERGE -> MAGENTA;
            default -> BLUE;
        };
    }

    private LinearLayout navRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        p.setMargins(0, dp(5), 0, 0);
        row.setLayoutParams(p);
        return row;
    }

    private TextView navChip(String label, int accent, int mode) {
        TextView chip = actionChip(label, accent, screenMode == mode);
        chip.setOnClickListener(view -> {
            if (screenMode != mode) transitionToPage(mode, mode > screenMode ? 1 : -1);
        });
        return chip;
    }

    private void requestAutomaticSync() {
        if (autoSyncInFlight) return;
        autoSyncInFlight = true;
        WatchSyncClient.refresh(this, (received, status) -> runOnUiThread(() -> {
            autoSyncInFlight = false;
            lastSyncStatus = status == null || status.isBlank()
                    ? "Sincronização automática ativa"
                    : status;
            renderSnapshot();
        }));
    }

    private void registerSnapshotUpdateReceiver() {
        if (snapshotUpdatedReceiver != null) return;
        snapshotUpdatedReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                lastSyncStatus = "Atualizado automaticamente";
                renderSnapshot();
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_SNAPSHOT_UPDATED);
        ContextCompat.registerReceiver(
                this,
                snapshotUpdatedReceiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void unregisterSnapshotUpdateReceiver() {
        if (snapshotUpdatedReceiver == null) return;
        try { unregisterReceiver(snapshotUpdatedReceiver); } catch (Exception ignored) {}
        snapshotUpdatedReceiver = null;
    }

    private String batteryLabel() {
        BatteryInfo info = batteryInfo();
        if (info.percent < 0) return "--";
        return (info.charging ? "⚡" : "") + info.percent + "%";
    }

    private int batteryAccent() {
        BatteryInfo info = batteryInfo();
        if (info.charging) return SUCCESS;
        if (info.percent >= 0 && info.percent <= 15) return MAGENTA;
        if (info.percent >= 0 && info.percent <= 30) return WARNING;
        return WHITE;
    }

    private BatteryInfo batteryInfo() {
        try {
            Intent status = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (status == null) return new BatteryInfo(-1, false);
            int level = status.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = status.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int state = status.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int percent = level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : -1;
            boolean charging = state == BatteryManager.BATTERY_STATUS_CHARGING
                    || state == BatteryManager.BATTERY_STATUS_FULL;
            return new BatteryInfo(percent, charging);
        } catch (Exception ignored) {
            return new BatteryInfo(-1, false);
        }
    }

    private void addProgramStrip(WatchContextSnapshot snapshot) {
        if (snapshot == null || snapshot.schedule.isEmpty()) return;

        WatchContextSnapshot.ScheduleItem first = snapshot.schedule.get(0);
        WatchContextSnapshot.ScheduleItem next =
                snapshot.schedule.size() > 1 ? snapshot.schedule.get(1) : null;
        int accent = "stay".equals(first.kind) ? MAGENTA
                : "flight".equals(first.kind) ? CYAN : VIOLET;

        LinearLayout card = premiumCard(accent);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(9), dp(8), dp(8), dp(8));

        TextView count = text(String.valueOf(snapshot.schedule.size()), 17, accent, true, Gravity.CENTER);
        card.addView(count, new LinearLayout.LayoutParams(dp(34), dp(48)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);

        TextView title = text(
                "PROGRAMAÇÃO · " + snapshot.schedule.size()
                        + (snapshot.schedule.size() == 1 ? " ETAPA" : " ETAPAS"),
                7, MUTED, true, Gravity.START
        );
        title.setLetterSpacing(.07f);
        copy.addView(title);

        TextView firstLine = text(
                join(" · ",
                        first.time,
                        first.title,
                        first.route,
                        first.presentation.isBlank() ? "" : "APZ " + first.presentation,
                        first.gate),
                9, WHITE, true, Gravity.START
        );
        firstLine.setMaxLines(2);
        firstLine.setPadding(0, dp(2), 0, 0);
        copy.addView(firstLine);

        if (next != null) {
            TextView nextLine = text(
                    join(" · ", "DEPOIS", next.time, next.title, next.route),
                    7, MUTED, false, Gravity.START
            );
            nextLine.setMaxLines(1);
            nextLine.setPadding(0, dp(3), 0, 0);
            copy.addView(nextLine);
        }

        card.addView(copy, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        ));

        TextView arrow = text("›", 20, accent, true, Gravity.CENTER);
        card.addView(arrow, new LinearLayout.LayoutParams(dp(22), dp(48)));

        card.setContentDescription(
                "Programação de hoje, " + snapshot.schedule.size()
                        + (snapshot.schedule.size() == 1 ? " etapa" : " etapas")
        );
        card.setOnClickListener(view -> transitionToPage(MODE_SCHEDULE, 1));
        content.addView(card, cardParams());
    }

    private void renderFooter() {
        String normalized = lastSyncStatus == null ? "" : lastSyncStatus.toLowerCase(Locale.ROOT);
        boolean attention = normalized.contains("offline")
                || normalized.contains("não respondeu")
                || normalized.contains("não conectado")
                || normalized.contains("precisa atualizar")
                || normalized.contains("antig");
        int accent = attention ? WARNING : SUCCESS;

        String label = lastSyncStatus == null || lastSyncStatus.isBlank()
                ? "● Sincronização automática"
                : "● " + lastSyncStatus;
        transientStatus = actionChip(label, accent, false);
        transientStatus.setTextSize(7);
        transientStatus.setContentDescription(
                "Sincronização automática. Toque para atualizar agora."
        );
        transientStatus.setOnClickListener(view -> {
            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            requestSync();
        });
        content.addView(transientStatus);
    }

    private Primary primaryFor(WatchContextSnapshot s) {
        return switch (s.state) {
            case "LEAVE_SOON" -> new Primary(
                    "HORA DE SAIR",
                    s.leaveTime.isBlank()
                            ? (s.headline.startsWith("SAIR EM") ? s.headline.replace("SAIR EM ", "") : firstNonBlank(s.primaryTime, s.headline))
                            : s.leaveTime,
                    s.trafficDetail,
                    presentationLine(s),
                    SUCCESS
            );
            case "REPORTING" -> new Primary(
                    "APRESENTAÇÃO",
                    firstNonBlank(s.presentationTime, s.primaryTime, s.headline),
                    s.presentationPlace,
                    flightLine(s),
                    CYAN
            );
            case "BOARDING" -> new Primary(
                    "EMBARQUE",
                    s.remoteStand ? "REMOTA" : firstNonBlank(s.gateLabel(), s.boardingTime, s.headline),
                    join(" · ", s.currentFlight,
                            s.boardingTime.isBlank() ? "" : "embarque " + s.boardingTime),
                    s.currentRoute,
                    VIOLET
            );
            case "IN_FLIGHT" -> new Primary(
                    "VOO ATUAL",
                    firstNonBlank(s.currentFlight, s.headline),
                    s.currentRoute,
                    join(" · ", s.eta.isBlank() ? "" : "ETA " + s.eta, s.gateLabel()),
                    CYAN
            );
            case "CONNECTION" -> new Primary(
                    "CONEXÃO",
                    firstNonBlank(s.connection, s.nextFlight, s.headline),
                    join(" · ", s.nextFlight, s.gateLabel()),
                    s.boardingTime.isBlank() ? s.nextDetail : "Embarque " + s.boardingTime,
                    VIOLET
            );
            case "OVERNIGHT" -> new Primary(
                    "PERNOITE",
                    firstNonBlank(s.overnight, s.headline),
                    firstNonBlank(s.hotelPickup, "Hotel confirmado"),
                    presentationLine(s),
                    WARNING
            );
            case "CHANGED" -> new Primary(
                    "ALTERAÇÃO",
                    firstNonBlank(s.headline, "Escala atualizada"),
                    s.detail,
                    "Confira antes de seguir",
                    MAGENTA
            );
            case "OFF_DUTY" -> new Primary(
                    "TUDO CERTO",
                    "Sem atividade agora",
                    "A próxima programação aparece automaticamente.",
                    "",
                    CYAN
            );
            default -> new Primary(
                    "AGORA",
                    firstNonBlank(s.primaryTime, s.headline, "CrewCheck"),
                    s.detail,
                    presentationLine(s),
                    CYAN
            );
        };
    }

    private List<Fact> secondaryFacts(WatchContextSnapshot s) {
        List<Fact> facts = new ArrayList<>();

        if (!s.presentationTime.isBlank() && !"REPORTING".equals(s.state)) {
            facts.add(new Fact("APRESENTAÇÃO", s.presentationTime, s.presentationPlace, CYAN));
        }

        if (!s.gateLabel().isBlank()) {
            facts.add(new Fact("PORTÃO", s.remoteStand ? "REMOTA" : s.gate, "", WARNING));
        }

        if (!s.eta.isBlank() && "IN_FLIGHT".equals(s.state)) {
            facts.add(new Fact("ETA", s.eta, "", CYAN));
        }

        if (!s.nextFlight.isBlank() && !"CONNECTION".equals(s.state)) {
            facts.add(new Fact("PRÓXIMO", s.nextFlight, s.connection, VIOLET));
        }

        if (!s.overnight.isBlank() && !"OVERNIGHT".equals(s.state)) {
            facts.add(new Fact("PERNOITE", s.overnight, s.hotelPickup, WARNING));
        }

        return facts;
    }

    private void addMiniStat(LinearLayout row, Fact fact) {
        LinearLayout box = premiumCard(fact.accent);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(5), dp(5), dp(5), dp(5));

        TextView label = text(fact.label, 7, MUTED, true, Gravity.CENTER);
        box.addView(label);

        TextView value = text(fact.value, 13, fact.accent, true, Gravity.CENTER);
        value.setMaxLines(1);
        box.addView(value);

        if (!fact.detail.isBlank()) {
            TextView detail = text(fact.detail, 7, MUTED, false, Gravity.CENTER);
            detail.setMaxLines(1);
            box.addView(detail);
        }

        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        );
        p.setMargins(dp(2), 0, dp(2), 0);
        row.addView(box, p);
    }

    private void addGlanceRail(WatchContextSnapshot snapshot, long now) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);

        BatteryInfo battery = batteryInfo();
        String batteryValue = battery.percent < 0
                ? "--"
                : (battery.charging ? "⚡" : "") + battery.percent + "%";
        String batteryDetail = battery.charging
                ? "carregando"
                : battery.percent >= 0 && battery.percent <= 15
                ? "recarregar"
                : "relógio";

        int scheduleCount = snapshot == null ? 0 : snapshot.schedule.size();
        String scheduleValue = scheduleCount == 0 ? "—" : String.valueOf(scheduleCount);
        String scheduleDetail = scheduleCount == 1 ? "etapa hoje" : "etapas hoje";

        String syncValue = "SEM DADOS";
        String syncDetail = "automático";
        int syncAccent = WARNING;
        if (snapshot != null) {
            if (snapshot.isStale(now)) {
                syncValue = "ANTIGO";
                syncDetail = "tentando atualizar";
            } else {
                long minutes = Math.max(0L, (now - snapshot.generatedAtEpochMs) / 60_000L);
                syncValue = minutes < 1L
                        ? "AGORA"
                        : minutes < 60L
                        ? minutes + " MIN"
                        : (minutes / 60L) + " H";
                syncAccent = SUCCESS;
            }
        }

        addGlanceMetric(row, "BATERIA", batteryValue, batteryDetail, batteryAccent());
        addGlanceMetric(row, "HOJE", scheduleValue, scheduleDetail, CYAN);
        addGlanceMetric(row, "SYNC", syncValue, syncDetail, syncAccent);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(5), 0, dp(2));
        content.addView(row, params);
    }

    private void addGlanceMetric(
            LinearLayout row,
            String label,
            String value,
            String detail,
            int accent
    ) {
        LinearLayout box = premiumCard(accent);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(4), dp(6), dp(4), dp(6));

        TextView title = text(label, 6, MUTED, true, Gravity.CENTER);
        title.setLetterSpacing(.06f);
        box.addView(title);

        TextView metric = text(value, value.length() > 8 ? 9 : 12, accent, true, Gravity.CENTER);
        metric.setMaxLines(1);
        metric.setPadding(0, dp(2), 0, 0);
        box.addView(metric);

        TextView hint = text(detail, 6, MUTED, false, Gravity.CENTER);
        hint.setMaxLines(1);
        hint.setPadding(0, dp(1), 0, 0);
        box.addView(hint);

        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        );
        p.setMargins(dp(2), 0, dp(2), 0);
        row.addView(box, p);
    }

    private void addCrewLifeStat(LinearLayout row, String label, String value, int accent) {
        LinearLayout box = premiumCard(accent);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(4), dp(6), dp(4), dp(6));
        box.addView(text(label, 7, MUTED, true, Gravity.CENTER));
        TextView metric = text(value, 11, accent, true, Gravity.CENTER);
        metric.setMaxLines(2);
        box.addView(metric);

        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        );
        p.setMargins(dp(2), 0, dp(2), 0);
        row.addView(box, p);
    }

    private void addNotificationCard(NotificationItem item) {
        LinearLayout card = premiumCard(item.accent);
        card.setOrientation(LinearLayout.VERTICAL);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = text(item.title, 11, WHITE, true, Gravity.START);
        top.addView(title, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView when = text(item.when, 8, item.accent, true, Gravity.END);
        top.addView(when);
        card.addView(top);

        TextView body = text(item.body, 9, MUTED, false, Gravity.START);
        body.setMaxLines(3);
        body.setPadding(0, dp(3), 0, 0);
        card.addView(body);

        content.addView(card, cardParams());
    }

    private List<NotificationItem> currentNotifications(WatchContextSnapshot s, long now) {
        List<NotificationItem> items = new ArrayList<>();
        if (s == null || s.isStale(now)) return items;

        if (s.changed || "CHANGED".equals(s.state)) {
            items.add(new NotificationItem(
                    "Escala alterada",
                    firstNonBlank(s.detail, s.headline, "Confira sua programação."),
                    "agora", MAGENTA
            ));
        }

        if ("LEAVE_SOON".equals(s.state)) {
            items.add(new NotificationItem(
                    "Hora de sair",
                    join(" · ",
                            s.leaveTime.isBlank() ? s.headline : "Saia às " + s.leaveTime,
                            s.trafficDetail),
                    "agora", SUCCESS
            ));
        }

        if ("BOARDING".equals(s.state) || !s.gateLabel().isBlank()) {
            items.add(new NotificationItem(
                    s.remoteStand ? "Embarque remoto" : "Portão",
                    join(" · ", s.currentFlight, s.remoteStand ? "Remota" : s.gateLabel(),
                            s.boardingTime.isBlank() ? "" : "embarque " + s.boardingTime),
                    "voo", VIOLET
            ));
        }

        if ("CONNECTION".equals(s.state)) {
            items.add(new NotificationItem(
                    "Conexão",
                    join(" · ", s.connection, s.nextFlight, s.gateLabel()),
                    "próximo", CYAN
            ));
        }

        if ("OVERNIGHT".equals(s.state)) {
            items.add(new NotificationItem(
                    "Pernoite",
                    join(" · ", s.overnight, s.hotelPickup),
                    "hotel", WARNING
            ));
        }

        CrewLifeSnapshot life = wellbeingStore.loadCrewLife();
        if (life != null && !life.isStale(now) && items.size() < 4) {
            items.add(new NotificationItem(
                    "CrewLife opcional",
                    life.recoveryScore > 0
                            ? (life.isEnergyScore()
                                ? "Energia " + life.recoveryScore + "/100 · "
                                : "Recuperação " + life.recoveryScore + "% · ")
                                + firstNonBlank(life.recommendation, life.recoveryLabel)
                            : life.recoveryLabel,
                    "bem-estar", SUCCESS
            ));
        }

        return items;
    }

    private int alertCount(WatchContextSnapshot snapshot) {
        if (snapshot == null) return 0;
        int count = 0;
        if (snapshot.changed || "CHANGED".equals(snapshot.state)) count++;
        if ("LEAVE_SOON".equals(snapshot.state)) count++;
        if ("BOARDING".equals(snapshot.state) || !snapshot.gateLabel().isBlank()) count++;
        return Math.min(count, 9);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_CONCIERGE_SPEECH
                || resultCode != android.app.Activity.RESULT_OK
                || data == null) {
            return;
        }

        ArrayList<String> results =
                data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (results == null || results.isEmpty()) {
            lastConciergeStatus = "Não consegui entender a fala";
            renderSnapshot();
            return;
        }

        String spoken = results.get(0) == null ? "" : results.get(0).trim();
        if (spoken.isBlank()) {
            lastConciergeStatus = "Fala vazia";
            renderSnapshot();
            return;
        }
        sendConciergeAction("VOICE", spoken);
    }

    private void requestSync() {
        if (transientStatus != null) transientStatus.setText("Buscando celular…");
        WatchSyncClient.refresh(this, (received, status) -> runOnUiThread(() -> {
            renderSnapshot();
            if (transientStatus != null) transientStatus.setText(status);
        }));
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 33 || notificationPermissionGranted()) return;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
    }

    private boolean notificationPermissionGranted() {
        return Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private LinearLayout premiumCard(int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(10), dp(8), dp(10), dp(8));
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{withAlpha(accent, 24), withAlpha(SURFACE_ALT, 238), withAlpha(BLUE, 10)}
        );
        background.setCornerRadius(dp(23));
        background.setStroke(dp(1), withAlpha(accent, 92));
        card.setBackground(background);
        return card;
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        p.setMargins(0, dp(3), 0, dp(3));
        return p;
    }

    private TextView heroAction(String label, int accent) {
        TextView chip = text(label, 10, WHITE, true, Gravity.CENTER);
        chip.setPadding(dp(16), dp(9), dp(16), dp(9));
        chip.setMinHeight(dp(40));
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(BLUE, 180), withAlpha(accent, 145)}
        );
        background.setCornerRadius(dp(24));
        background.setStroke(dp(1), withAlpha(CYAN, 150));
        chip.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(2), dp(7), dp(2), dp(2));
        chip.setLayoutParams(params);
        return chip;
    }

    private TextView actionChip(String label, int accent, boolean selected) {
        TextView chip = text(label, 9, selected ? WHITE : accent, true, Gravity.CENTER);
        chip.setPadding(dp(12), dp(7), dp(12), dp(7));
        chip.setMinHeight(dp(36));

        GradientDrawable background = new GradientDrawable();
        background.setColor(selected ? withAlpha(accent, 48) : SURFACE_ALT);
        background.setCornerRadius(dp(20));
        background.setStroke(dp(1), withAlpha(accent, selected ? 190 : 80));
        chip.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(2), dp(2), dp(2), 0);
        chip.setLayoutParams(params);
        return chip;
    }

    private TextView text(String value, int sp, int color, boolean bold, int gravity) {
        TextView view = new TextView(this);
        view.setText(value == null ? "" : value);
        view.setTextColor(color);
        view.setTextSize(sp);
        view.setGravity(gravity);
        view.setMaxLines(3);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        view.setIncludeFontPadding(false);
        return view;
    }

    private boolean isRoundScreen() {
        return (getResources().getConfiguration().screenLayout
                & Configuration.SCREENLAYOUT_ROUND_MASK)
                == Configuration.SCREENLAYOUT_ROUND_YES;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }

    private static String presentationLine(WatchContextSnapshot s) {
        if (s.presentationTime.isBlank() && s.presentationPlace.isBlank()) return "";
        return join(" · ",
                s.presentationPlace,
                s.presentationTime.isBlank() ? "" : "apresentação " + s.presentationTime);
    }

    private static String flightLine(WatchContextSnapshot s) {
        return join(" · ", s.currentFlight, s.currentRoute, s.gateLabel());
    }

    private static String actionLabel(WatchContextSnapshot s) {
        return switch (s.state) {
            case "LEAVE_SOON" -> "Atualizar trânsito";
            case "BOARDING" -> "Ver embarque";
            case "CONNECTION" -> "Ver conexão";
            case "OVERNIGHT" -> "Ver pernoite";
            default -> "Ver escala";
        };
    }

    private static String stateGlyph(String state) {
        return switch (state) {
            case "LEAVE_SOON" -> "●";
            case "REPORTING" -> "✈";
            case "BOARDING" -> "✈";
            case "IN_FLIGHT" -> "✈";
            case "CONNECTION" -> "↗";
            case "OVERNIGHT" -> "■";
            case "CHANGED" -> "!";
            default -> "•";
        };
    }

    private static String sleepLabel(CrewLifeSnapshot life) {
        if (!life.sleepLabel.isBlank()) return life.sleepLabel;
        if (life.sleepMinutes <= 0) return "--";
        return (life.sleepMinutes / 60) + "h" + String.format(Locale.ROOT, "%02d", life.sleepMinutes % 60);
    }

    private static String crewLifeHero(CrewLifeSnapshot life) {
        if (life.recoveryScore > 0) {
            return life.isEnergyScore()
                    ? life.recoveryScore + "/100"
                    : life.recoveryScore + "%";
        }
        if (!life.recoveryLabel.isBlank() && !"DESCONHECIDA".equals(life.recoveryLabel)) {
            String label = life.recoveryLabel.toLowerCase(Locale.ROOT);
            return label.substring(0, 1).toUpperCase(Locale.ROOT) + label.substring(1);
        }
        if (!life.sleepLabel.isBlank()) return life.sleepLabel;
        if (life.sleepMinutes > 0) return sleepLabel(life);
        if (life.steps > 0) return compactSteps(life.steps) + " passos";
        if (life.activeMinutes > 0) return life.activeMinutes + " min";
        return "Registro local";
    }

    private static String compactSteps(int steps) {
        if (steps <= 0) return "--";
        if (steps < 1000) return String.valueOf(steps);
        return String.format(Locale.ROOT, "%.1fk", steps / 1000.0);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private static String join(String separator, String... values) {
        StringBuilder result = new StringBuilder();
        for (String value : values) {
            if (value == null || value.isBlank()) continue;
            if (result.length() > 0) result.append(separator);
            result.append(value);
        }
        return result.toString();
    }

    private static final class BatteryInfo {
        final int percent;
        final boolean charging;

        BatteryInfo(int percent, boolean charging) {
            this.percent = percent;
            this.charging = charging;
        }
    }

    private static final class Primary {
        final String eyebrow;
        final String value;
        final String detail;
        final String secondary;
        final int accent;

        Primary(String eyebrow, String value, String detail, String secondary, int accent) {
            this.eyebrow = eyebrow == null ? "" : eyebrow;
            this.value = value == null ? "" : value;
            this.detail = detail == null ? "" : detail;
            this.secondary = secondary == null ? "" : secondary;
            this.accent = accent;
        }
    }

    private static final class Fact {
        final String label;
        final String value;
        final String detail;
        final int accent;

        Fact(String label, String value, String detail, int accent) {
            this.label = label;
            this.value = value == null ? "" : value;
            this.detail = detail == null ? "" : detail;
            this.accent = accent;
        }
    }

    private static final class NotificationItem {
        final String title;
        final String body;
        final String when;
        final int accent;

        NotificationItem(String title, String body, String when, int accent) {
            this.title = title == null ? "" : title;
            this.body = body == null ? "" : body;
            this.when = when == null ? "" : when;
            this.accent = accent;
        }
    }
}
