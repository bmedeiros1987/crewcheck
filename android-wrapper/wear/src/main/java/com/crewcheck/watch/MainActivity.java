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
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
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
    private ScrollView scroll;
    private LinearLayout content;
    private TextView clockView;
    private TextView transientStatus;
    private boolean ambient;
    private int screenMode = MODE_NOW;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        store = new SecureSnapshotStore(this);
        wellbeingStore = new WellbeingStore(this);
        AmbientModeSupport.attach(this);
        installBackNavigation();
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
        ensureRotaryFocus();
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
        scroll = new ScrollView(this);
        scroll.setBackgroundColor(ambient ? BLACK : NAVY);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        enableRotaryScrolling(scroll);

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

    /**
     * Moldura giratória do Galaxy Watch e coroa dos demais Wear OS.
     *
     * Sem isto o giro não faz nada: a ScrollView só responde a toque, e num relógio com
     * moldura o gesto natural do usuário é girar. O evento chega como ACTION_SCROLL vindo
     * de SOURCE_ROTARY_ENCODER, com AXIS_SCROLL positivo para cima — daí o sinal invertido
     * ao converter em deslocamento de rolagem.
     *
     * O foco é pedido em {@link #ensureRotaryFocus()}, não aqui: rotary só é entregue à view
     * focada, e requestFocus() numa view ainda sem janela não faz nada.
     */
    private void enableRotaryScrolling(ScrollView target) {
        target.setFocusable(true);
        target.setFocusableInTouchMode(true);
        target.setOnGenericMotionListener((view, event) -> {
            if (event.getAction() != MotionEvent.ACTION_SCROLL
                    || !event.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
                return false;
            }
            float delta = -event.getAxisValue(MotionEvent.AXIS_SCROLL)
                    * ViewConfiguration.get(this).getScaledVerticalScrollFactor();
            target.scrollBy(0, Math.round(delta));
            return true;
        });
    }

    /**
     * Voltar (inclusive o gesto de arrastar da borda) sobe um nível em vez de fechar o app.
     *
     * Estando numa tela interna, sair do app inteiro é perda de contexto: o usuário quer
     * voltar para Agora. Só na tela raiz o voltar segue para o sistema.
     */
    /**
     * Mantém a ScrollView com foco, que é para onde o sistema entrega o giro da moldura.
     *
     * Precisa ser reafirmado depois de cada render: renderSnapshot() recria os filhos, e um
     * filho focável pode tomar o foco no caminho.
     */
    private void ensureRotaryFocus() {
        if (scroll == null || ambient) return;
        scroll.post(() -> {
            if (scroll != null && !scroll.hasFocus()) scroll.requestFocus();
        });
    }

    private void installBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (screenMode != MODE_NOW) {
                    showScreen(MODE_NOW);
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    /**
     * Troca de tela sempre volta ao topo.
     *
     * renderSnapshot() recria o conteúdo, mas a ScrollView guarda o deslocamento anterior:
     * trocar de tela no fim da rolagem abria a próxima no meio, sem cabeçalho.
     */
    private void showScreen(int mode) {
        screenMode = mode;
        renderSnapshot();
        if (scroll != null) scroll.post(() -> scroll.scrollTo(0, 0));
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
                    showScreen(MODE_NOW);
                } catch (Exception error) {
                    if (transientStatus != null) transientStatus.setText("Demo indisponível");
                }
            });
            content.addView(demo);
        }

        ensureRotaryFocus();
    }

    private void renderHeader(WatchContextSnapshot snapshot) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.crewcheck_official);
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        row.addView(logo, new LinearLayout.LayoutParams(dp(26), dp(26)));

        TextView brand = text("CrewCheck", 11, WHITE, true, Gravity.START);
        brand.setPadding(dp(6), 0, 0, 0);
        row.addView(brand, new LinearLayout.LayoutParams(0, dp(26), 1f));

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
            badge.setOnClickListener(view -> showScreen(MODE_NOTIFICATIONS));
        }

        clockView = text(LocalTime.now().format(clockFormatter), 10, WHITE, true, Gravity.END);
        row.addView(clockView, new LinearLayout.LayoutParams(dp(52), dp(26)));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(28)
        );
        params.setMargins(dp(2), 0, dp(2), dp(6));
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

        View glow = new View(this);
        GradientDrawable glowBg = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(CYAN, 20), withAlpha(VIOLET, 45), withAlpha(MAGENTA, 20)}
        );
        glowBg.setCornerRadius(dp(28));
        glow.setBackground(glowBg);
        content.addView(glow, new LinearLayout.LayoutParams(dp(118), dp(3)));

        TextView icon = text(stateGlyph(snapshot.state), 19, accent, true, Gravity.CENTER);
        icon.setPadding(0, dp(8), 0, dp(2));
        content.addView(icon);

        TextView eyebrow = text(
                stale ? "DADOS ANTIGOS" : primary.eyebrow,
                9, accent, true, Gravity.CENTER
        );
        eyebrow.setLetterSpacing(.08f);
        content.addView(eyebrow);

        TextView value = text(
                stale ? "Confira no celular" : primary.value,
                stale ? 19 : (primary.value.length() > 14 ? 23 : 32),
                WHITE, true, Gravity.CENTER
        );
        value.setMaxLines(2);
        value.setPadding(0, dp(3), 0, 0);
        content.addView(value);

        if (!primary.detail.isBlank()) {
            TextView detail = text(primary.detail, 11, stale ? WARNING : WHITE,
                    false, Gravity.CENTER);
            detail.setMaxLines(2);
            detail.setPadding(0, dp(4), 0, 0);
            content.addView(detail);
        }

        if (!primary.secondary.isBlank()) {
            TextView secondary = text(primary.secondary, 9, MUTED, false, Gravity.CENTER);
            secondary.setPadding(0, dp(4), 0, dp(5));
            secondary.setMaxLines(2);
            content.addView(secondary);
        }

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
            params.setMargins(0, dp(6), 0, dp(2));
            content.addView(stats, params);
        }

        TextView cta = heroAction(actionLabel(snapshot), accent);
        cta.setOnClickListener(view -> {
            if ("LEAVE_SOON".equals(snapshot.state)) requestSync();
            else showScreen(MODE_SCHEDULE);
        });
        content.addView(cta);

        TextView freshness = text(snapshot.statusLabel(now), 8,
                stale ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(5), 0, 0);
        content.addView(freshness);
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
            TextView empty = text("Nada urgente agora.", 16, WHITE, true, Gravity.CENTER);
            empty.setPadding(0, dp(12), 0, dp(4));
            content.addView(empty);
            TextView detail = text("Quando algo realmente importar, o CrewCheck aparece no seu pulso.",
                    9, MUTED, false, Gravity.CENTER);
            detail.setMaxLines(3);
            content.addView(detail);
            return;
        }

        for (NotificationItem item : items) addNotificationCard(item);
    }

    private void renderCrewLife(long now) {
        TextView overline = text("CrewLife opcional", 9, MAGENTA, true, Gravity.CENTER);
        overline.setPadding(0, dp(3), 0, dp(4));
        content.addView(overline);

        CrewLifeSnapshot life = wellbeingStore.loadCrewLife();
        RoutineSnapshot routine = wellbeingStore.loadRoutine();

        if (life == null || life.isStale(now)) {
            TextView title = text("CrewLife no pulso", 19, WHITE, true, Gravity.CENTER);
            title.setMaxLines(2);
            content.addView(title);
            TextView detail = text(
                    "CrewLife no relógio ainda não autorizado. No celular, ative “Mostrar CrewLife no relógio”. Só chegam valores agregados que você escolher.",
                    9, MUTED, false, Gravity.CENTER
            );
            detail.setMaxLines(4);
            detail.setPadding(0, dp(6), 0, dp(8));
            content.addView(detail);
            TextView sync = heroAction("Sincronizar CrewLife", MAGENTA);
            sync.setOnClickListener(view -> requestSync());
            content.addView(sync);
            return;
        }

        String primaryScore = life.recoveryScore > 0
                ? (life.isEnergyScore() ? life.recoveryScore + "/100" : life.recoveryScore + "%")
                : life.recoveryLabel;
        TextView score = text(primaryScore, 34, SUCCESS, true, Gravity.CENTER);
        content.addView(score);

        String scoreCaption = life.isEnergyScore()
                ? "Energy Score · Samsung Health"
                : "Recuperação " + life.recoveryLabel.toLowerCase(Locale.ROOT);
        TextView label = text(scoreCaption, 10, WHITE, true, Gravity.CENTER);
        label.setPadding(0, dp(1), 0, dp(6));
        content.addView(label);

        LinearLayout stats = new LinearLayout(this);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        stats.setGravity(Gravity.CENTER);
        addCrewLifeStat(stats, "SONO", sleepLabel(life), VIOLET);
        addCrewLifeStat(stats, "PASSOS", compactSteps(life.steps), CYAN);
        addCrewLifeStat(stats, "FC REPOUSO",
                life.restingHeartRate > 0 ? life.restingHeartRate + " bpm" : "--", SUCCESS);
        content.addView(stats, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        if (!life.recommendation.isBlank()) {
            TextView recommendation = text(life.recommendation, 10, MAGENTA, true, Gravity.CENTER);
            recommendation.setPadding(0, dp(7), 0, dp(2));
            content.addView(recommendation);
        }

        if (routine != null && !routine.isStale(now)) {
            LinearLayout card = premiumCard(VIOLET);
            TextView rTitle = text("ROTINA · " + firstNonBlank(routine.title, "HOJE"),
                    9, VIOLET, true, Gravity.CENTER);
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
                "CrewLife é opcional. Dados brutos de saúde não ficam no mostrador.",
                8, MUTED, false, Gravity.CENTER
        );
        privacy.setMaxLines(3);
        privacy.setPadding(0, dp(6), 0, 0);
        content.addView(privacy);
    }

    private void renderSchedule(WatchContextSnapshot snapshot, long now) {
        TextView title = text("MINHA ESCALA", 10, CYAN, true, Gravity.CENTER);
        title.setLetterSpacing(.09f);
        title.setPadding(0, dp(3), 0, dp(2));
        content.addView(title);

        TextView subtitle = text("Próximos passos", 15, WHITE, true, Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dp(7));
        content.addView(subtitle);

        if (snapshot == null || snapshot.schedule.isEmpty()) {
            TextView empty = text(
                    "Sincronize o CrewCheck no celular para abrir sua escala aqui.",
                    10, MUTED, false, Gravity.CENTER
            );
            empty.setMaxLines(4);
            empty.setPadding(0, dp(10), 0, dp(12));
            content.addView(empty);
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
        LinearLayout first = navRow();
        first.addView(navChip("Agora", CYAN, MODE_NOW));
        first.addView(navChip("Alertas" + (alertCount(snapshot) > 0 ? " " + alertCount(snapshot) : ""),
                MAGENTA, MODE_NOTIFICATIONS));

        LinearLayout second = navRow();
        second.addView(navChip("CrewLife", SUCCESS, MODE_CREWLIFE));
        second.addView(navChip(
                snapshot != null && !snapshot.schedule.isEmpty()
                        ? "Escala " + snapshot.schedule.size()
                        : "Escala",
                VIOLET, MODE_SCHEDULE
        ));

        content.addView(first);
        content.addView(second);
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
        chip.setOnClickListener(view -> showScreen(mode));
        return chip;
    }

    private void renderFooter() {
        transientStatus = text("", 8, MUTED, false, Gravity.CENTER);
        transientStatus.setPadding(dp(4), dp(3), dp(4), 0);
        content.addView(transientStatus);

        TextView sync = actionChip("Sincronizar", BLUE, false);
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
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(accent, 24), SURFACE_ALT}
        );
        background.setCornerRadius(dp(22));
        background.setStroke(dp(1), withAlpha(accent, 100));
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
