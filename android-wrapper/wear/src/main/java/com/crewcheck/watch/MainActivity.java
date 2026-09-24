package com.crewcheck.watch;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.TouchDelegate;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.fragment.app.FragmentActivity;
import androidx.wear.ambient.AmbientModeSupport;
import androidx.wear.widget.SwipeDismissFrameLayout;

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

    /**
     * Fundo de tela preto puro, exigido pelas Diretrizes de qualidade de apps
     * para Wear (e o que a revisão do Play recusou em 24/09/2026: "o segundo
     * plano não é preto"). O navy #030A16 anterior acendia pixel em OLED na
     * área inteira da tela. Os cards continuam usando SURFACE/SURFACE_ALT.
     */
    private static final int SCREEN_BG = Color.BLACK;
    private static final int BLACK = Color.BLACK;
    private static final int SURFACE = Color.rgb(8, 22, 42);
    private static final int SURFACE_ALT = Color.rgb(11, 30, 57);
    private static final int WHITE = Color.rgb(248, 250, 252);
    private static final int MUTED = Color.rgb(153, 169, 194);
    private static final int MUTED_AMBIENT = Color.rgb(132, 138, 148);
    private static final int AMBIENT_TEXT = Color.rgb(214, 220, 228);
    private static final int CYAN = Color.rgb(34, 211, 238);
    private static final int BLUE = Color.rgb(59, 130, 246);
    private static final int TEAL = Color.rgb(45, 212, 191);
    private static final int VIOLET = Color.rgb(139, 92, 246);
    private static final int MAGENTA = Color.rgb(236, 72, 153);
    private static final int SUCCESS = Color.rgb(52, 211, 153);
    private static final int WARNING = Color.rgb(251, 191, 36);
    private static final int ORANGE = Color.rgb(251, 146, 60);

    /**
     * Escala tipográfica Wear. O piso é 10sp (caption3 do Material Wear): abaixo
     * disso o texto deixa de ser legível à distância de pulso e o
     * setIncludeFontPadding(false) passa a cortar acentos.
     */
    private static final int T_CAPTION = 10;
    private static final int T_LABEL = 11;
    private static final int T_BODY = 12;
    private static final int T_BODY_STRONG = 13;
    private static final int T_TITLE = 14;
    private static final int T_TITLE_LG = 16;
    private static final int T_HEADING = 18;
    private static final int T_HEADING_LG = 20;

    /** Área mínima de toque no Wear OS. */
    private static final int TOUCH_MIN_DP = 48;

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
    private ScrollView scrollView;
    private LinearLayout content;
    private TextView clockView;
    private TextView transientStatus;
    private boolean ambient;
    private boolean burnInProtection;
    private boolean lowBitAmbient;
    private int screenMode = MODE_NOW;
    private int lastRenderedMode = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        store = new SecureSnapshotStore(this);
        wellbeingStore = new WellbeingStore(this);
        AmbientModeSupport.attach(this);
        applyIntentScreen(getIntent());
        renderRoot();
        registerBackToNow();
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
        // A bezel/coroa só entrega ACTION_SCROLL para a view que tem foco.
        if (scrollView != null) scrollView.requestFocus();
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
                if (ambientDetails != null) {
                    burnInProtection = ambientDetails.getBoolean(
                            AmbientModeSupport.EXTRA_BURN_IN_PROTECTION, false);
                    lowBitAmbient = ambientDetails.getBoolean(
                            AmbientModeSupport.EXTRA_LOWBIT_AMBIENT, false);
                }
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
                if (!ambient) return;
                // Virada de minuto: só o relógio muda. Reconstruir a árvore
                // inteira aqui gastava bateria e piscava a tela a cada minuto.
                if (clockView != null) {
                    clockView.setText(LocalTime.now().format(clockFormatter));
                    applyBurnInShift();
                } else {
                    renderSnapshot();
                }
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
        scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(SCREEN_BG);
        scrollView.setFillViewport(true);
        scrollView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Indicador de rolagem visível: a ausência dele foi recusada pela
        // revisão do Play em 24/09/2026 ("barra de rolagem ausente"). Fica
        // dentro do padding para não encostar na borda da tela redonda.
        scrollView.setVerticalScrollBarEnabled(true);
        scrollView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        scrollView.setScrollbarFadingEnabled(true);
        enableRotaryScroll(scrollView);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        applySafePadding();

        scrollView.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        SwipeDismissFrameLayout swipeRoot = new SwipeDismissFrameLayout(this);
        swipeRoot.addCallback(new SwipeDismissFrameLayout.Callback() {
            @Override
            public void onDismissed(SwipeDismissFrameLayout layout) {
                // Deslizar para a direita volta para "Agora"; só encerra o app se
                // já estivermos nele. Antes qualquer swipe fechava o CrewCheck no
                // meio da escala.
                layout.setVisibility(View.VISIBLE);
                if (screenMode != MODE_NOW) {
                    screenMode = MODE_NOW;
                    renderSnapshot();
                } else {
                    finish();
                }
            }
        });
        swipeRoot.addView(scrollView);

        setContentView(swipeRoot);
        renderSnapshot();
    }

    /**
     * Bezel do Galaxy Watch e coroa digital. O ScrollView nativo ignora
     * SOURCE_ROTARY_ENCODER, então telas roláveis (Escala, Alertas) só andavam
     * com arraste na tela.
     */
    private void enableRotaryScroll(ScrollView scroll) {
        scroll.setFocusable(true);
        scroll.setFocusableInTouchMode(true);
        scroll.requestFocus();
        scroll.setOnGenericMotionListener((view, event) -> {
            if (event.getAction() != MotionEvent.ACTION_SCROLL
                    || !event.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
                return false;
            }
            float delta = -event.getAxisValue(MotionEvent.AXIS_SCROLL)
                    * ViewConfiguration.get(this).getScaledVerticalScrollFactor();
            scroll.scrollBy(0, Math.round(delta));
            return true;
        });
    }

    /** Botão físico / gesto de voltar retorna para "Agora" antes de sair. */
    private void registerBackToNow() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (screenMode != MODE_NOW) {
                    screenMode = MODE_NOW;
                    renderSnapshot();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    /**
     * Desloca o conteúdo alguns pixels por minuto quando o mostrador pede
     * proteção contra burn-in em ambient.
     */
    private void applyBurnInShift() {
        if (content == null) return;
        if (!ambient || !burnInProtection) {
            content.setTranslationX(0f);
            content.setTranslationY(0f);
            return;
        }
        int step = LocalTime.now().getMinute() % 4;
        content.setTranslationX(dp(step - 2));
        content.setTranslationY(dp(((step + 2) % 4) - 2));
    }

    /**
     * Valor "herói" da tela. Antes o tamanho era escolhido por contagem de
     * caracteres (length() > 14 ? 23 : 32), o que quebrava com a fonte grande do
     * sistema e em mostradores de 192dp. O autosize mede de verdade.
     */
    private TextView heroValue(String value, int minSp, int maxSp, int color, int maxLines) {
        TextView view = text(value, maxSp, color, true, Gravity.CENTER);
        view.setMaxLines(maxLines);
        view.setAutoSizeTextTypeUniformWithConfiguration(
                minSp, maxSp, 1, TypedValue.COMPLEX_UNIT_SP);
        // Autosize exige largura limitada; com WRAP_CONTENT o Android ignora.
        view.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        return view;
    }

    /**
     * Amplia a área sensível ao toque de um alvo pequeno demais para 48dp sem
     * inchar o desenho dele.
     */
    private void expandTouchTarget(View child, ViewGroup parent) {
        final int min = dp(TOUCH_MIN_DP);
        parent.post(() -> {
            Rect hit = new Rect();
            child.getHitRect(hit);
            hit.inset(
                    -Math.max(0, (min - hit.width()) / 2),
                    -Math.max(0, (min - hit.height()) / 2)
            );
            parent.setTouchDelegate(new TouchDelegate(hit, child));
        });
    }

    /**
     * Inset proporcional à tela em vez de dp fixo. Os 30dp de cada lado do valor
     * anterior comiam quase um terço da largura útil de um mostrador de 192dp e
     * mesmo assim cortavam o topo, onde a corda do círculo é mais curta.
     */
    private void applySafePadding() {
        boolean round = isRoundScreen();
        int width = getResources().getDisplayMetrics().widthPixels;
        int height = getResources().getDisplayMetrics().heightPixels;

        int horizontal = Math.round(width * (round ? .075f : .055f));
        int topSafe = Math.round(height * (round ? .105f : .045f));
        int bottomSafe = Math.round(height * (round ? .150f : .075f));
        content.setPadding(horizontal, topSafe, horizontal, bottomSafe);
    }

    private void renderSnapshot() {
        if (content == null) return;

        // Trocar de aba recomeça do topo; um refresh da mesma tela preserva onde
        // o usuário estava — antes qualquer re-render jogava a rolagem no zero.
        boolean sameScreen = lastRenderedMode == screenMode;
        final int keepScroll = sameScreen && scrollView != null ? scrollView.getScrollY() : 0;
        lastRenderedMode = screenMode;

        content.removeAllViews();
        applySafePadding();
        applyBurnInShift();
        content.getRootView().setBackgroundColor(SCREEN_BG);

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
            TextView demo = text("Demonstração local", T_LABEL, MUTED, false, Gravity.CENTER);
            demo.setPadding(dp(10), dp(12), dp(10), dp(12));
            demo.setMinHeight(dp(TOUCH_MIN_DP));
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

        if (scrollView != null) scrollView.post(() -> scrollView.scrollTo(0, keepScroll));
    }

    private void renderHeader(WatchContextSnapshot snapshot) {
        boolean round = isRoundScreen();

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        // O header cai na corda mais curta do círculo, então leva um inset maior
        // que o resto do conteúdo.
        int headerInset = round
                ? Math.round(getResources().getDisplayMetrics().widthPixels * .07f)
                : 0;
        row.setPadding(headerInset, 0, headerInset, 0);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.crewcheck_official);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        row.addView(logo, new LinearLayout.LayoutParams(dp(24), dp(24)));

        // Em tela redonda não há largura para logo + wordmark + badge + relógio
        // sem truncar algum deles; o logo já cumpre o papel da marca.
        if (round) {
            row.addView(new View(this), new LinearLayout.LayoutParams(0, dp(28), 1f));
        } else {
            TextView brand = text("CrewCheck", T_TITLE, WHITE, true, Gravity.START);
            brand.setPadding(dp(6), 0, 0, 0);
            brand.setMaxLines(1);
            row.addView(brand, new LinearLayout.LayoutParams(0, dp(28), 1f));
        }

        int count = alertCount(snapshot);
        if (count > 0) {
            TextView badge = text(String.valueOf(count), T_LABEL, WHITE, true, Gravity.CENTER);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(MAGENTA);
            bg.setShape(GradientDrawable.OVAL);
            badge.setBackground(bg);
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(dp(28), dp(28));
            bp.setMargins(0, 0, dp(6), 0);
            row.addView(badge, bp);
            badge.setOnClickListener(view -> {
                screenMode = MODE_NOTIFICATIONS;
                renderSnapshot();
            });
            // 28dp desenhados, 48dp sensíveis ao toque.
            expandTouchTarget(badge, row);
        }

        clockView = text(LocalTime.now().format(clockFormatter), T_BODY_STRONG,
                WHITE, true, Gravity.END);
        clockView.setMaxLines(1);
        row.addView(clockView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, dp(28)));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(32)
        );
        params.setMargins(0, 0, 0, dp(6));
        content.addView(row, params);
    }

    private void renderAmbient(WatchContextSnapshot snapshot, long now) {
        boolean round = isRoundScreen();
        int width = getResources().getDisplayMetrics().widthPixels;
        int height = getResources().getDisplayMetrics().heightPixels;
        int horizontal = Math.round(width * (round ? .11f : .08f));
        content.setPadding(horizontal, Math.round(height * .16f),
                horizontal, Math.round(height * .10f));

        // Ambient em OLED: nada de branco puro em área grande. Traço fino, cor
        // rebaixada e, quando o mostrador é low-bit, sem meios-tons.
        int primaryInk = lowBitAmbient ? Color.WHITE : AMBIENT_TEXT;
        int secondaryInk = lowBitAmbient ? Color.WHITE : MUTED_AMBIENT;

        TextView time = text(LocalTime.now().format(clockFormatter), 36,
                primaryInk, false, Gravity.CENTER);
        // Guardado para que a virada de minuto troque só este texto.
        clockView = time;
        content.addView(time);

        if (snapshot == null || snapshot.isStale(now)) {
            TextView hint = text("CrewCheck", T_BODY, secondaryInk, true, Gravity.CENTER);
            hint.setPadding(0, dp(8), 0, 0);
            content.addView(hint);
            return;
        }

        Primary primary = primaryFor(snapshot);
        TextView eyebrow = text(primary.eyebrow, T_CAPTION, secondaryInk, true, Gravity.CENTER);
        eyebrow.setPadding(0, dp(12), 0, dp(3));
        content.addView(eyebrow);

        content.addView(heroValue(primary.value, T_TITLE_LG, 24, primaryInk, 2));

        if (!snapshot.gateLabel().isBlank()) {
            TextView gate = text(snapshot.remoteStand ? "REMOTA" : snapshot.gateLabel(),
                    T_BODY, secondaryInk, true, Gravity.CENTER);
            gate.setPadding(0, dp(8), 0, 0);
            content.addView(gate);
        }
    }

    private void renderEmptyState() {
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.crewcheck_official);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        content.addView(logo, new LinearLayout.LayoutParams(dp(52), dp(52)));

        TextView title = text("SINCRONIZAR", T_BODY, CYAN, true, Gravity.CENTER);
        title.setLetterSpacing(.08f);
        title.setPadding(0, dp(8), 0, dp(5));
        content.addView(title);

        content.addView(heroValue("Conecte ao CrewCheck", T_TITLE_LG, 24, WHITE, 2));

        TextView detail = text(
                "Abra o app no celular. Sua escala, próximos passos e alertas chegam automaticamente.",
                T_BODY, MUTED, false, Gravity.CENTER
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
        // Proporcional: dp(118) fixo desalinhava entre 192dp e 227dp de largura.
        int glowWidth = Math.round(getResources().getDisplayMetrics().widthPixels * .42f);
        content.addView(glow, new LinearLayout.LayoutParams(glowWidth, dp(3)));

        TextView icon = text(stateGlyph(snapshot.state), T_HEADING_LG, accent, true, Gravity.CENTER);
        icon.setPadding(0, dp(8), 0, dp(2));
        content.addView(icon);

        TextView eyebrow = text(
                stale ? "DADOS ANTIGOS" : primary.eyebrow,
                T_LABEL, accent, true, Gravity.CENTER
        );
        eyebrow.setLetterSpacing(.08f);
        content.addView(eyebrow);

        TextView value = heroValue(
                stale ? "Confira no celular" : primary.value,
                T_HEADING, stale ? 22 : 32, WHITE, 2
        );
        value.setPadding(0, dp(3), 0, 0);
        content.addView(value);

        if (!primary.detail.isBlank()) {
            TextView detail = text(primary.detail, T_TITLE, stale ? WARNING : WHITE,
                    false, Gravity.CENTER);
            detail.setMaxLines(2);
            detail.setPadding(0, dp(4), 0, 0);
            content.addView(detail);
        }

        if (!primary.secondary.isBlank()) {
            TextView secondary = text(primary.secondary, T_BODY, MUTED, false, Gravity.CENTER);
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
            else {
                screenMode = MODE_SCHEDULE;
                renderSnapshot();
            }
        });
        content.addView(cta);

        TextView freshness = text(snapshot.statusLabel(now), T_LABEL,
                stale ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(5), 0, 0);
        content.addView(freshness);
    }

    private void renderNotifications(WatchContextSnapshot snapshot, long now) {
        TextView title = text("NOTIFICAÇÕES", T_BODY, CYAN, true, Gravity.CENTER);
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
                    T_BODY, WARNING, false, Gravity.CENTER
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
            TextView empty = text("Nada urgente agora.", T_HEADING, WHITE, true, Gravity.CENTER);
            empty.setPadding(0, dp(12), 0, dp(4));
            content.addView(empty);
            TextView detail = text("Quando algo realmente importar, o CrewCheck aparece no seu pulso.",
                    T_BODY, MUTED, false, Gravity.CENTER);
            detail.setMaxLines(3);
            content.addView(detail);
            return;
        }

        for (NotificationItem item : items) addNotificationCard(item);
    }

    private void renderCrewLife(long now) {
        TextView overline = text("CrewLife opcional", T_LABEL, MAGENTA, true, Gravity.CENTER);
        overline.setPadding(0, dp(3), 0, dp(4));
        content.addView(overline);

        CrewLifeSnapshot life = wellbeingStore.loadCrewLife();
        RoutineSnapshot routine = wellbeingStore.loadRoutine();

        if (life == null || life.isStale(now)) {
            content.addView(heroValue("CrewLife no pulso", T_TITLE_LG, T_HEADING_LG, WHITE, 2));
            TextView detail = text(
                    "CrewLife no relógio ainda não autorizado. No celular, ative “Mostrar CrewLife no relógio”. Só chegam valores agregados que você escolher.",
                    T_BODY, MUTED, false, Gravity.CENTER
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
        content.addView(heroValue(primaryScore, 22, 34, SUCCESS, 1));

        String scoreCaption = life.isEnergyScore()
                ? "Energy Score · Samsung Health"
                : "Recuperação " + life.recoveryLabel.toLowerCase(Locale.ROOT);
        TextView label = text(scoreCaption, T_BODY_STRONG, WHITE, true, Gravity.CENTER);
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
            TextView recommendation = text(life.recommendation, T_BODY, MAGENTA, true, Gravity.CENTER);
            recommendation.setPadding(0, dp(7), 0, dp(2));
            content.addView(recommendation);
        }

        if (routine != null && !routine.isStale(now)) {
            LinearLayout card = premiumCard(VIOLET);
            TextView rTitle = text("ROTINA · " + firstNonBlank(routine.title, "HOJE"),
                    T_LABEL, VIOLET, true, Gravity.CENTER);
            card.addView(rTitle);
            TextView rValue = text(
                    routine.durationMinutes > 0 ? routine.durationMinutes + " min" : routine.nextAction,
                    T_HEADING, WHITE, true, Gravity.CENTER
            );
            card.addView(rValue);
            TextView rDetail = text(firstNonBlank(routine.nextAction, routine.reason),
                    T_LABEL, MUTED, false, Gravity.CENTER);
            rDetail.setMaxLines(2);
            card.addView(rDetail);
            content.addView(card, cardParams());
        }

        TextView privacy = text(
                "CrewLife é opcional. Dados brutos de saúde não ficam no mostrador.",
                T_LABEL, MUTED, false, Gravity.CENTER
        );
        privacy.setMaxLines(3);
        privacy.setPadding(0, dp(6), 0, 0);
        content.addView(privacy);
    }

    private void renderSchedule(WatchContextSnapshot snapshot, long now) {
        TextView title = text("MINHA ESCALA", T_BODY, CYAN, true, Gravity.CENTER);
        title.setLetterSpacing(.09f);
        title.setPadding(0, dp(3), 0, dp(2));
        content.addView(title);

        TextView subtitle = text("Próximos passos", T_TITLE_LG, WHITE, true, Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dp(7));
        content.addView(subtitle);

        if (snapshot == null || snapshot.schedule.isEmpty()) {
            TextView empty = text(
                    "Sincronize o CrewCheck no celular para abrir sua escala aqui.",
                    T_BODY, MUTED, false, Gravity.CENTER
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

        TextView freshness = text(snapshot.statusLabel(now), T_LABEL,
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

        TextView time = text(item.time.isBlank() ? "•" : item.time, T_TITLE_LG,
                first ? accent : WHITE, true, Gravity.CENTER);
        time.setMaxLines(1);
        card.addView(time, new LinearLayout.LayoutParams(dp(54), dp(TOUCH_MIN_DP)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setGravity(Gravity.CENTER_VERTICAL);

        TextView headline = text(item.title, T_TITLE, WHITE, true, Gravity.START);
        headline.setMaxLines(1);
        copy.addView(headline);

        String route = join(" · ",
                item.route,
                item.presentation.isBlank() ? "" : "APZ " + item.presentation,
                item.gate.isBlank() ? "" : item.gate
        );
        TextView detail = text(route, T_LABEL, MUTED, false, Gravity.START);
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
        // Chips de largura igual: com WRAP_CONTENT cada alvo tinha um tamanho
        // diferente e a linha ficava desalinhada.
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0, dp(TOUCH_MIN_DP), 1f);
        params.setMargins(dp(3), dp(4), dp(3), 0);
        chip.setLayoutParams(params);
        chip.setPadding(dp(4), 0, dp(4), 0);
        chip.setOnClickListener(view -> {
            screenMode = mode;
            renderSnapshot();
        });
        return chip;
    }

    private void renderFooter() {
        transientStatus = text("", T_LABEL, MUTED, false, Gravity.CENTER);
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

        TextView label = text(fact.label, T_CAPTION, MUTED, true, Gravity.CENTER);
        box.addView(label);

        TextView value = text(fact.value, T_TITLE_LG, fact.accent, true, Gravity.CENTER);
        value.setMaxLines(1);
        box.addView(value);

        if (!fact.detail.isBlank()) {
            TextView detail = text(fact.detail, T_CAPTION, MUTED, false, Gravity.CENTER);
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
        box.addView(text(label, T_CAPTION, MUTED, true, Gravity.CENTER));
        TextView metric = text(value, T_TITLE, accent, true, Gravity.CENTER);
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

        TextView title = text(item.title, T_TITLE, WHITE, true, Gravity.START);
        top.addView(title, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView when = text(item.when, T_LABEL, item.accent, true, Gravity.END);
        top.addView(when);
        card.addView(top);

        TextView body = text(item.body, T_BODY, MUTED, false, Gravity.START);
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
        TextView chip = text(label, T_TITLE, WHITE, true, Gravity.CENTER);
        chip.setPadding(dp(18), dp(12), dp(18), dp(12));
        chip.setMinHeight(dp(TOUCH_MIN_DP));
        chip.setMaxLines(1);
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
        TextView chip = text(label, T_BODY_STRONG, selected ? WHITE : accent, true, Gravity.CENTER);
        chip.setPadding(dp(14), dp(12), dp(14), dp(12));
        chip.setMinHeight(dp(TOUCH_MIN_DP));
        chip.setMaxLines(1);

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
        view.setEllipsize(TextUtils.TruncateAt.END);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        // includeFontPadding(false) cortava o topo de á, ã, é — e a interface é
        // toda em português.
        view.setIncludeFontPadding(true);
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
