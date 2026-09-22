package com.crewcheck.watch;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

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
    private static final int MODE_NOTIFICATIONS = 1;
    private static final int MODE_CREWLIFE = 2;
    private static final int MODE_SCHEDULE = 3;
    private static final int REQUEST_NOTIFICATIONS = 4102;

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

    private SecureSnapshotStore store;
    private WellbeingStore wellbeingStore;
    private LinearLayout content;
    private TextView clockView;
    private TextView transientStatus;
    private boolean ambient;
    private int screenMode = MODE_NOW;
    private float touchDownX;
    private float touchDownY;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        store = new SecureSnapshotStore(this);
        wellbeingStore = new WellbeingStore(this);
        AmbientModeSupport.attach(this);
        applyIntentScreen(getIntent());
        renderRoot();
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
        renderSnapshot();
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(clockTick);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
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
        if ("notifications".equals(requested)) screenMode = MODE_NOTIFICATIONS;
        else if ("crewlife".equals(requested)) screenMode = MODE_CREWLIFE;
        else if ("schedule".equals(requested)) screenMode = MODE_SCHEDULE;
    }

    private void restartClock() {
        handler.removeCallbacks(clockTick);
        if (!ambient) handler.post(clockTick);
    }

    private void renderRoot() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(ambient ? BLACK : NAVY);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOnTouchListener((view, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                touchDownX = event.getX();
                touchDownY = event.getY();
            } else if (event.getAction() == MotionEvent.ACTION_UP) {
                float dx = event.getX() - touchDownX;
                float dy = event.getY() - touchDownY;
                if (Math.abs(dx) > dp(52) && Math.abs(dx) > Math.abs(dy) * 1.25f) {
                    if (dx < 0) screenMode = (screenMode + 1) % 4;
                    else screenMode = (screenMode + 3) % 4;
                    renderSnapshot();
                }
            }
            return false;
        });

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        applySafePadding();

        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));
        setContentView(scroll);
        renderSnapshot();
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

        switch (screenMode) {
            case MODE_NOTIFICATIONS -> renderNotifications(snapshot, now);
            case MODE_CREWLIFE -> renderCrewLife(now);
            case MODE_SCHEDULE -> renderSchedule(snapshot, now);
            default -> {
                if (snapshot == null) renderEmptyState();
                else renderLiveState(snapshot, now);
            }
        }

        addNavigation(snapshot);
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
        row.addView(logo, new LinearLayout.LayoutParams(dp(24), dp(24)));

        TextView brand = text("CrewCheck", 14, WHITE, true, Gravity.START);
        brand.setPadding(dp(7), 0, 0, 0);
        row.addView(brand, new LinearLayout.LayoutParams(0, dp(28), 1f));

        int count = alertCount(snapshot);
        TextView bell = text(count > 0 ? "♢ " + count : "♢", 11,
                count > 0 ? MAGENTA : MUTED, true, Gravity.CENTER);
        GradientDrawable bellBg = new GradientDrawable();
        bellBg.setColor(count > 0 ? withAlpha(MAGENTA, 28) : withAlpha(SURFACE_ALT, 220));
        bellBg.setCornerRadius(dp(18));
        bellBg.setStroke(dp(1), withAlpha(count > 0 ? MAGENTA : BLUE, 115));
        bell.setBackground(bellBg);
        bell.setPadding(dp(8), dp(4), dp(8), dp(4));
        bell.setOnClickListener(view -> {
            screenMode = MODE_NOTIFICATIONS;
            renderSnapshot();
        });
        row.addView(bell);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(32)
        );
        params.setMargins(dp(2), 0, dp(2), dp(5));
        content.addView(row, params);
    }

    private void renderAmbient(WatchContextSnapshot snapshot, long now) {
        content.setPadding(isRoundScreen() ? dp(42) : dp(28), dp(46),
                isRoundScreen() ? dp(42) : dp(28), dp(28));

        TextView time = text(LocalTime.now().format(clockFormatter), 38,
                WHITE, false, Gravity.CENTER);
        content.addView(time);

        if (snapshot == null || snapshot.isStale(now)) {
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

    private void renderEmptyState() {
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.crewcheck_official);
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        content.addView(logo, new LinearLayout.LayoutParams(dp(54), dp(54)));

        TextView title = text("SINCRONIZAR", 10, CYAN, true, Gravity.CENTER);
        title.setLetterSpacing(.08f);
        title.setPadding(0, dp(8), 0, dp(5));
        content.addView(title);

        TextView value = text("Conecte ao CrewCheck", 23, WHITE, true, Gravity.CENTER);
        value.setMaxLines(2);
        content.addView(value);

        TextView detail = text(
                "Abra o app no celular. Sua escala, próximos passos e alertas chegam automaticamente.",
                10, MUTED, false, Gravity.CENTER
        );
        detail.setMaxLines(4);
        detail.setPadding(0, dp(6), 0, dp(8));
        content.addView(detail);

        TextView sync = heroAction("Sincronizar agora", CYAN);
        sync.setOnClickListener(view -> requestSync());
        content.addView(sync);
    }

    private void renderLiveState(WatchContextSnapshot snapshot, long now) {
        boolean stale = snapshot.isStale(now);
        Primary primary = primaryFor(snapshot);
        int accent = snapshot.changed ? MAGENTA : stale ? WARNING : primary.accent;

        CrewLifeSnapshot life = wellbeingStore.loadCrewLife();
        if (life != null && !life.isStale(now)) {
            TextView lifeChip = actionChip("⌁ CrewLife  opcional", SUCCESS, false);
            lifeChip.setOnClickListener(view -> {
                screenMode = MODE_CREWLIFE;
                renderSnapshot();
            });
            content.addView(lifeChip);
        }

        LinearLayout hero = premiumCard(accent);
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(12), dp(10), dp(12), dp(11));

        TextView stateIcon = text(stateGlyph(snapshot.state), 18, accent, true, Gravity.CENTER);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.OVAL);
        iconBg.setColor(withAlpha(accent, 24));
        iconBg.setStroke(dp(1), withAlpha(accent, 190));
        stateIcon.setBackground(iconBg);
        stateIcon.setGravity(Gravity.CENTER);
        hero.addView(stateIcon, new LinearLayout.LayoutParams(dp(48), dp(48)));

        String heroLabel;
        String heroValue;
        String heroDetail;
        switch (snapshot.state) {
            case "LEAVE_SOON" -> {
                heroLabel = "Saia às";
                heroValue = firstNonBlank(snapshot.leaveTime, primary.value);
                heroDetail = firstNonBlank(snapshot.trafficDetail, primary.detail);
            }
            case "IN_FLIGHT" -> {
                heroLabel = "Voo atual";
                heroValue = firstNonBlank(snapshot.currentFlight, primary.value);
                heroDetail = firstNonBlank(snapshot.currentRoute, primary.detail);
            }
            case "CONNECTION" -> {
                heroLabel = "Próxima perna";
                heroValue = firstNonBlank(snapshot.nextFlight, primary.value);
                heroDetail = firstNonBlank(snapshot.nextDetail, snapshot.connection, primary.detail);
            }
            case "OVERNIGHT" -> {
                heroLabel = "Pernoite";
                heroValue = firstNonBlank(snapshot.overnight, primary.value);
                heroDetail = firstNonBlank(snapshot.hotelPickup, primary.detail);
            }
            case "BOARDING" -> {
                heroLabel = "Embarque";
                heroValue = firstNonBlank(snapshot.boardingTime, snapshot.primaryTime, primary.value);
                heroDetail = firstNonBlank(flightLine(snapshot), primary.detail);
            }
            default -> {
                heroLabel = stale ? "Dados antigos" : "Apresentação";
                heroValue = stale ? "Confira no celular" : firstNonBlank(snapshot.presentationTime, primary.value);
                heroDetail = firstNonBlank(snapshot.presentationPlace, flightLine(snapshot), primary.detail);
            }
        }

        TextView label = text(heroLabel, 15, stale ? WARNING : WHITE, false, Gravity.CENTER);
        label.setPadding(0, dp(6), 0, 0);
        hero.addView(label);

        TextView value = text(heroValue, heroValue.length() > 10 ? 31 : 42,
                WHITE, true, Gravity.CENTER);
        value.setMaxLines(2);
        hero.addView(value);

        if (!heroDetail.isBlank()) {
            TextView detail = text(heroDetail, 11, accent, true, Gravity.CENTER);
            detail.setMaxLines(2);
            detail.setPadding(0, dp(2), 0, dp(5));
            hero.addView(detail);
        }

        if ("LEAVE_SOON".equals(snapshot.state) || "REPORTING".equals(snapshot.state)) {
            LinearLayout sub = premiumCard(BLUE);
            sub.setOrientation(LinearLayout.HORIZONTAL);
            sub.setGravity(Gravity.CENTER_VERTICAL);
            sub.setPadding(dp(10), dp(7), dp(10), dp(7));

            TextView cal = text("□", 18, BLUE, true, Gravity.CENTER);
            sub.addView(cal, new LinearLayout.LayoutParams(dp(42), dp(42)));

            LinearLayout copy = new LinearLayout(this);
            copy.setOrientation(LinearLayout.VERTICAL);
            TextView p1 = text("Apresentação", 9, MUTED, false, Gravity.START);
            TextView p2 = text(firstNonBlank(snapshot.presentationTime, "--"), 18, WHITE, true, Gravity.START);
            TextView p3 = text(firstNonBlank(snapshot.presentationPlace, snapshot.currentRoute), 9, MUTED, false, Gravity.START);
            copy.addView(p1); copy.addView(p2); copy.addView(p3);
            sub.addView(copy, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            hero.addView(sub, cardParams());
        } else {
            List<Fact> facts = secondaryFacts(snapshot);
            if (!facts.isEmpty()) {
                LinearLayout stats = new LinearLayout(this);
                stats.setOrientation(LinearLayout.HORIZONTAL);
                stats.setGravity(Gravity.CENTER);
                addMiniStat(stats, facts.get(0));
                if (facts.size() > 1) addMiniStat(stats, facts.get(1));
                hero.addView(stats, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                ));
            }
        }

        content.addView(hero, cardParams());

        if (life != null && !life.isStale(now)) {
            String wellbeing = life.recoveryScore > 0
                    ? "CrewLife • " + life.recoveryScore + "%"
                    : "CrewLife • bem-estar ativo";
            TextView wellbeingChip = actionChip("♡ " + wellbeing, MAGENTA, false);
            wellbeingChip.setOnClickListener(view -> {
                screenMode = MODE_CREWLIFE;
                renderSnapshot();
            });
            content.addView(wellbeingChip);
        }

        TextView freshness = text(snapshot.statusLabel(now), 7,
                stale ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(3), 0, 0);
        content.addView(freshness);
    }

    private void renderNotifications(WatchContextSnapshot snapshot, long now) {
        TextView icon = text("♢", 22, BLUE, true, Gravity.CENTER);
        icon.setPadding(0, dp(1), 0, 0);
        content.addView(icon);

        TextView title = text("Notificações", 18, WHITE, true, Gravity.CENTER);
        title.setPadding(0, 0, 0, dp(7));
        content.addView(title);

        if (!notificationPermissionGranted()) {
            LinearLayout warning = premiumCard(WARNING);
            TextView copy = text(
                    "Permita notificações para receber hora de sair, mudança de portão, embarque e conexão.",
                    9, WHITE, false, Gravity.CENTER
            );
            copy.setMaxLines(4);
            warning.addView(copy);
            TextView allow = actionChip("Permitir no relógio", WARNING, false);
            allow.setOnClickListener(view -> requestNotificationPermissionIfNeeded());
            warning.addView(allow);
            content.addView(warning, cardParams());
        }

        List<NotificationItem> items = currentNotifications(snapshot, now);
        if (items.isEmpty()) {
            LinearLayout emptyCard = premiumCard(BLUE);
            TextView empty = text("Nada urgente agora", 16, WHITE, true, Gravity.CENTER);
            TextView detail = text(
                    "O CrewCheck só chama sua atenção quando houver algo relevante para a operação.",
                    9, MUTED, false, Gravity.CENTER
            );
            detail.setMaxLines(3);
            detail.setPadding(0, dp(4), 0, 0);
            emptyCard.addView(empty);
            emptyCard.addView(detail);
            content.addView(emptyCard, cardParams());
        } else {
            int shown = 0;
            for (NotificationItem item : items) {
                if (shown >= 4) break;
                addNotificationCard(item);
                shown++;
            }
        }

        boolean enabled = WatchNotificationCenter.isEnabled(this);
        TextView state = actionChip(enabled ? "Relógio • notificações ativas" : "Relógio • notificações pausadas",
                enabled ? CYAN : MUTED, enabled);
        state.setOnClickListener(view -> {
            boolean next = !WatchNotificationCenter.isEnabled(this);
            WatchNotificationCenter.setEnabled(this, next);
            if (next) requestNotificationPermissionIfNeeded();
            renderSnapshot();
        });
        content.addView(state);
    }

    private void renderCrewLife(long now) {
        CrewLifeSnapshot life = wellbeingStore.loadCrewLife();
        RoutineSnapshot routine = wellbeingStore.loadRoutine();

        TextView overline = actionChip("⌁ CrewLife  opcional", CYAN, true);
        content.addView(overline);

        TextView leaf = text("⌁", 28, CYAN, true, Gravity.CENTER);
        GradientDrawable leafBg = new GradientDrawable();
        leafBg.setShape(GradientDrawable.OVAL);
        leafBg.setColor(withAlpha(CYAN, 22));
        leafBg.setStroke(dp(2), withAlpha(CYAN, 210));
        leaf.setBackground(leafBg);
        content.addView(leaf, new LinearLayout.LayoutParams(dp(58), dp(58)));

        TextView title = text("CrewLife", 26, WHITE, true, Gravity.CENTER);
        title.setPadding(0, dp(5), 0, 0);
        content.addView(title);

        if (life == null || life.isStale(now)) {
            TextView state = text("Aguardando dados do celular", 13, CYAN, true, Gravity.CENTER);
            state.setPadding(0, dp(2), 0, dp(5));
            content.addView(state);

            LinearLayout empty = premiumCard(CYAN);
            TextView detail = text(
                    "Se o CrewLife já estiver ativo, abra-o no celular e toque em Sincronizar. O relógio recebe somente resumos agregados autorizados.",
                    9, MUTED, false, Gravity.CENTER
            );
            detail.setMaxLines(5);
            empty.addView(detail);
            TextView sync = heroAction("Sincronizar CrewLife", CYAN);
            sync.setOnClickListener(view -> requestSync());
            empty.addView(sync);
            content.addView(empty, cardParams());
            return;
        }

        String stateText;
        if (life.has("recoveryScore") && life.recoveryScore > 0) {
            stateText = "Recuperação " + life.recoveryScore + "%";
        } else if (life.has("recoveryLabel")
                && !life.recoveryLabel.isBlank()
                && !"DESCONHECIDA".equals(life.recoveryLabel)) {
            stateText = "Recuperação " + life.recoveryLabel.toLowerCase(Locale.ROOT);
        } else {
            stateText = "Resumo do CrewLife";
        }
        TextView state = text(stateText, 14, CYAN, true, Gravity.CENTER);
        state.setPadding(0, dp(1), 0, dp(6));
        content.addView(state);

        LinearLayout stats = new LinearLayout(this);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        stats.setGravity(Gravity.CENTER);
        addCrewLifeStat(stats, "Sono", life.has("sleepMinutes") || life.has("sleepLabel") ? sleepLabel(life) : "--", VIOLET);
        addCrewLifeStat(stats, "Passos", life.has("steps") ? compactSteps(life.steps) : "--", CYAN);
        boolean hasRestingHeartRate = life.has("restingHeartRate") && life.restingHeartRate > 0;
        String third = hasRestingHeartRate
                ? life.restingHeartRate + " bpm"
                : life.has("activeMinutes") ? life.activeMinutes + " min" : "--";
        addCrewLifeStat(stats, hasRestingHeartRate ? "FC repouso" : "Atividade", third, SUCCESS);
        content.addView(stats, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        if (routine != null && !routine.isStale(now)) {
            LinearLayout card = premiumCard(VIOLET);
            TextView rTitle = text("Rotina • " + firstNonBlank(routine.title, "Hoje"),
                    10, VIOLET, true, Gravity.CENTER);
            card.addView(rTitle);
            String rMain = routine.durationMinutes > 0
                    ? routine.durationMinutes + " min"
                    : firstNonBlank(routine.nextAction, "Sugestão disponível");
            TextView rValue = text(rMain, 16, WHITE, true, Gravity.CENTER);
            rValue.setPadding(0, dp(2), 0, 0);
            card.addView(rValue);
            String detail = firstNonBlank(routine.nextAction, routine.reason);
            if (!detail.isBlank()) {
                TextView rDetail = text(detail, 8, MUTED, false, Gravity.CENTER);
                rDetail.setMaxLines(2);
                card.addView(rDetail);
            }
            content.addView(card, cardParams());
        }

        TextView privacy = text(
                "Somente valores agregados autorizados chegam ao pulso.",
                8, MUTED, false, Gravity.CENTER
        );
        privacy.setMaxLines(2);
        privacy.setPadding(0, dp(5), 0, 0);
        content.addView(privacy);
    }

    private void renderSchedule(WatchContextSnapshot snapshot, long now) {
        TextView overline = text("MINHA ESCALA", 8, VIOLET, true, Gravity.CENTER);
        overline.setLetterSpacing(.10f);
        content.addView(overline);

        TextView glyph = text("▦", 20, VIOLET, true, Gravity.CENTER);
        content.addView(glyph);

        TextView title = text("Escala no relógio", 18, WHITE, true, Gravity.CENTER);
        TextView subtitle = text("Sua jornada, no seu pulso.", 9, CYAN, false, Gravity.CENTER);
        subtitle.setPadding(0, dp(1), 0, dp(7));
        content.addView(title);
        content.addView(subtitle);

        if (snapshot == null || snapshot.schedule.isEmpty()) {
            LinearLayout empty = premiumCard(VIOLET);
            TextView copy = text(
                    "Sincronize o CrewCheck no celular para abrir sua escala aqui.",
                    10, MUTED, false, Gravity.CENTER
            );
            copy.setMaxLines(4);
            empty.addView(copy);
            content.addView(empty, cardParams());
            return;
        }

        int count = 0;
        for (WatchContextSnapshot.ScheduleItem item : snapshot.schedule) {
            if (count >= 5) break;
            addScheduleItem(item, count == 0);
            count++;
        }

        TextView freshness = text(snapshot.statusLabel(now), 8,
                snapshot.isStale(now) ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(5), 0, 0);
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

        TextView headline = text(item.title, 12, WHITE, true, Gravity.START);
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
        LinearLayout dots = new LinearLayout(this);
        dots.setOrientation(LinearLayout.HORIZONTAL);
        dots.setGravity(Gravity.CENTER);
        int[] modes = {MODE_NOW, MODE_NOTIFICATIONS, MODE_CREWLIFE, MODE_SCHEDULE};
        int[] colors = {CYAN, MAGENTA, SUCCESS, VIOLET};
        for (int i = 0; i < modes.length; i++) {
            final int mode = modes[i];
            View dot = new View(this);
            GradientDrawable bg = new GradientDrawable();
            bg.setShape(GradientDrawable.OVAL);
            boolean selected = screenMode == mode;
            bg.setColor(selected ? colors[i] : withAlpha(MUTED, 75));
            if (selected) bg.setStroke(dp(1), withAlpha(colors[i], 230));
            dot.setBackground(bg);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                    dp(selected ? 10 : 7), dp(selected ? 10 : 7)
            );
            p.setMargins(dp(4), dp(6), dp(4), dp(2));
            dot.setLayoutParams(p);
            dot.setOnClickListener(view -> {
                screenMode = mode;
                renderSnapshot();
            });
            dots.addView(dot);
        }
        content.addView(dots);
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
            screenMode = mode;
            renderSnapshot();
        });
        return chip;
    }

    private void renderFooter() {
        transientStatus = text("", 8, MUTED, false, Gravity.CENTER);
        transientStatus.setPadding(dp(4), dp(2), dp(4), 0);
        content.addView(transientStatus);

        TextView sync = text("↻  Sincronizar", 8, BLUE, true, Gravity.CENTER);
        sync.setPadding(dp(10), dp(5), dp(10), dp(5));
        sync.setOnClickListener(view -> requestSync());
        content.addView(sync);
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
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(9), dp(7), dp(9), dp(7));

        String glyph = item.title.toLowerCase(Locale.ROOT).contains("portão") ? "✈"
                : item.title.toLowerCase(Locale.ROOT).contains("sair") ? "●"
                : item.title.toLowerCase(Locale.ROOT).contains("crewlife") ? "⌁"
                : "!";
        TextView icon = text(glyph, 16, item.accent, true, Gravity.CENTER);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.OVAL);
        iconBg.setColor(withAlpha(item.accent, 20));
        iconBg.setStroke(dp(1), withAlpha(item.accent, 190));
        icon.setBackground(iconBg);
        card.addView(icon, new LinearLayout.LayoutParams(dp(46), dp(46)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(8), 0, 0, 0);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = text(item.title, 11, WHITE, true, Gravity.START);
        title.setMaxLines(2);
        top.addView(title, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView when = text(item.when, 8, item.accent, true, Gravity.END);
        top.addView(when);
        copy.addView(top);

        TextView body = text(item.body, 9, MUTED, false, Gravity.START);
        body.setMaxLines(2);
        body.setPadding(0, dp(2), 0, 0);
        copy.addView(body);

        card.addView(copy, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        ));
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
                            ? "Recuperação " + life.recoveryScore + "% · " + firstNonBlank(life.recommendation, life.recoveryLabel)
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
                new int[]{
                        withAlpha(accent, 24),
                        Color.rgb(7, 22, 46),
                        Color.rgb(4, 13, 30)
                }
        );
        background.setCornerRadius(dp(24));
        background.setStroke(dp(1), withAlpha(accent, 135));
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
