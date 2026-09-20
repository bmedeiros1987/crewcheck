package com.crewcheck.watch;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
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
 * CrewCheck Watch — Pulse UI.
 *
 * A glance-first companion to CrewCheck Mobile. The watch consumes an already canonical,
 * presentation-ready projection and can also open a compact roster view. It never parses rosters.
 */
public final class MainActivity extends FragmentActivity
        implements AmbientModeSupport.AmbientCallbackProvider {

    private static final int NAVY = Color.rgb(5, 11, 20);
    private static final int BLACK = Color.BLACK;
    private static final int SURFACE = Color.rgb(10, 22, 36);
    private static final int SURFACE_ALT = Color.rgb(14, 29, 47);
    private static final int WHITE = Color.rgb(248, 250, 252);
    private static final int MUTED = Color.rgb(151, 166, 187);
    private static final int MUTED_AMBIENT = Color.rgb(145, 145, 145);
    private static final int CYAN = Color.rgb(34, 211, 238);
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
    private LinearLayout content;
    private TextView clockView;
    private TextView transientStatus;
    private boolean ambient;
    private boolean scheduleMode;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        store = new SecureSnapshotStore(this);
        AmbientModeSupport.attach(this);
        renderRoot();
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
                scheduleMode = false;
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
        int horizontal = isRoundScreen() ? dp(36) : dp(20);
        int topSafe = isRoundScreen() ? dp(20) : dp(10);
        int bottomSafe = isRoundScreen() ? dp(34) : dp(22);
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

        renderHeader();

        if (scheduleMode) {
            renderSchedule(snapshot, now);
        } else if (snapshot == null) {
            renderEmptyState();
        } else {
            renderLiveState(snapshot, now);
        }

        addModeSwitcher(snapshot);

        transientStatus = text("", 8, MUTED, false, Gravity.CENTER);
        transientStatus.setPadding(dp(4), dp(4), dp(4), 0);
        content.addView(transientStatus);

        TextView sync = actionChip("↻  Sincronizar", CYAN, false);
        sync.setOnClickListener(view -> requestSync());
        content.addView(sync);

        if (BuildConfig.DEBUG) {
            TextView demo = text("Demonstração", 8, MUTED, false, Gravity.CENTER);
            demo.setPadding(dp(8), dp(6), dp(8), dp(7));
            demo.setOnClickListener(view -> {
                store.save(WatchContextSnapshot.demo(System.currentTimeMillis()).toJson().toString());
                scheduleMode = false;
                renderSnapshot();
                if (transientStatus != null) transientStatus.setText("Demo local · não operacional");
            });
            content.addView(demo);
        }
    }

    private void renderHeader() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        TextView brand = text("✈  CrewCheck", 9, CYAN, true, Gravity.START);
        brand.setLetterSpacing(.05f);
        row.addView(brand, new LinearLayout.LayoutParams(0, dp(26), 1f));

        clockView = text(LocalTime.now().format(clockFormatter), 10, WHITE, true, Gravity.END);
        row.addView(clockView, new LinearLayout.LayoutParams(dp(54), dp(26)));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(26)
        );
        params.setMargins(dp(2), 0, dp(2), dp(4));
        row.setLayoutParams(params);
        content.addView(row);
    }

    private void renderAmbient(WatchContextSnapshot snapshot, long now) {
        content.setPadding(isRoundScreen() ? dp(42) : dp(28), dp(46),
                isRoundScreen() ? dp(42) : dp(28), dp(28));

        TextView time = text(LocalTime.now().format(clockFormatter), 36,
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
    }

    private void renderEmptyState() {
        addAccentDivider(VIOLET);

        TextView title = text("CONECTE O CREWCHECK", 9, VIOLET, true, Gravity.CENTER);
        title.setPadding(0, dp(7), 0, dp(5));
        content.addView(title);

        TextView value = text("Abra no celular", 22, WHITE, true, Gravity.CENTER);
        value.setMaxLines(2);
        content.addView(value);

        TextView detail = text(
                "A escala e o próximo passo aparecem aqui automaticamente.",
                10,
                MUTED,
                false,
                Gravity.CENTER
        );
        detail.setMaxLines(3);
        detail.setPadding(0, dp(5), 0, dp(8));
        content.addView(detail);

        addAccentDivider(CYAN);
    }

    private void renderLiveState(WatchContextSnapshot snapshot, long now) {
        boolean stale = snapshot.isStale(now);
        Primary primary = primaryFor(snapshot);
        int accent = snapshot.changed ? MAGENTA : stale ? WARNING : primary.accent;

        addAccentDivider(accent);

        TextView eyebrow = text(
                stale ? "DADOS ANTIGOS" : primary.eyebrow,
                8,
                accent,
                true,
                Gravity.CENTER
        );
        eyebrow.setLetterSpacing(.09f);
        eyebrow.setPadding(0, dp(7), 0, dp(4));
        content.addView(eyebrow);

        TextView value = text(
                stale ? "Confira no celular" : primary.value,
                stale ? 18 : (primary.value.length() > 14 ? 21 : 29),
                WHITE,
                true,
                Gravity.CENTER
        );
        value.setMaxLines(2);
        content.addView(value);

        if (!primary.detail.isBlank()) {
            TextView detail = text(primary.detail, 10, stale ? WARNING : WHITE,
                    false, Gravity.CENTER);
            detail.setMaxLines(2);
            detail.setPadding(0, dp(4), 0, 0);
            content.addView(detail);
        }

        if (!primary.secondary.isBlank()) {
            TextView secondary = text(primary.secondary, 9, MUTED,
                    false, Gravity.CENTER);
            secondary.setPadding(0, dp(4), 0, dp(5));
            secondary.setMaxLines(2);
            content.addView(secondary);
        }

        addAccentDivider(withAlpha(accent, 130));

        LinearLayout stats = new LinearLayout(this);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        stats.setGravity(Gravity.CENTER);
        List<Fact> facts = secondaryFacts(snapshot);
        if (!facts.isEmpty()) addMiniStat(stats, facts.get(0));
        if (facts.size() > 1) addMiniStat(stats, facts.get(1));
        if (stats.getChildCount() > 0) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            params.setMargins(0, dp(5), 0, dp(1));
            content.addView(stats, params);
        }

        TextView freshness = text(snapshot.statusLabel(now), 8,
                stale ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(5), 0, dp(2));
        content.addView(freshness);
    }

    private void renderSchedule(WatchContextSnapshot snapshot, long now) {
        addAccentDivider(MAGENTA);

        TextView title = text("MINHA ESCALA", 9, MAGENTA, true, Gravity.CENTER);
        title.setLetterSpacing(.10f);
        title.setPadding(0, dp(6), 0, dp(2));
        content.addView(title);

        TextView subtitle = text("Próximas programações", 11, WHITE, true, Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dp(7));
        content.addView(subtitle);

        if (snapshot == null || snapshot.schedule.isEmpty()) {
            TextView empty = text(
                    "Sincronize o CrewCheck Mobile para abrir sua escala aqui.",
                    10,
                    MUTED,
                    false,
                    Gravity.CENTER
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
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(9), dp(8), dp(9), dp(8));

        int accent = "stay".equals(item.kind) ? MAGENTA
                : "flight".equals(item.kind) ? CYAN
                : VIOLET;
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(accent, 30), SURFACE}
        );
        background.setCornerRadius(dp(17));
        background.setStroke(dp(1), withAlpha(accent, first ? 135 : 65));
        card.setBackground(background);

        TextView time = text(item.time.isBlank() ? "•" : item.time, 11,
                first ? accent : WHITE, true, Gravity.CENTER);
        card.addView(time, new LinearLayout.LayoutParams(dp(48), dp(38)));

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

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(2), 0, dp(3));
        content.addView(card, params);
    }

    private void addModeSwitcher(WatchContextSnapshot snapshot) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);

        TextView now = actionChip("Agora", CYAN, !scheduleMode);
        now.setOnClickListener(view -> {
            scheduleMode = false;
            renderSnapshot();
        });

        TextView roster = actionChip(
                snapshot != null && !snapshot.schedule.isEmpty()
                        ? "Escala " + snapshot.schedule.size()
                        : "Escala",
                MAGENTA,
                scheduleMode
        );
        roster.setOnClickListener(view -> {
            scheduleMode = true;
            renderSnapshot();
        });

        row.addView(now);
        row.addView(roster);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(4), 0, dp(1));
        content.addView(row, params);
    }

    private Primary primaryFor(WatchContextSnapshot s) {
        return switch (s.state) {
            case "LEAVE_SOON" -> new Primary(
                    "SAÍDA INTELIGENTE",
                    s.headline.startsWith("SAIR EM") ? s.headline.replace("SAIR EM ", "") : firstNonBlank(s.leaveTime, s.primaryTime),
                    s.leaveTime.isBlank() ? s.trafficDetail : "Sair " + s.leaveTime,
                    join(" · ", s.trafficDetail, presentationLine(s)),
                    TEAL
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
                    "PRÓXIMA PERNA",
                    firstNonBlank(s.nextFlight, s.connection, s.headline),
                    s.nextDetail,
                    s.connection.isBlank() ? "" : "Em " + s.connection.toLowerCase(Locale.ROOT),
                    VIOLET
            );
            case "OVERNIGHT" -> new Primary(
                    "PERNOITE",
                    firstNonBlank(s.overnight, s.headline),
                    s.hotelPickup,
                    presentationLine(s),
                    MAGENTA
            );
            case "CHANGED" -> new Primary(
                    "ALTERAÇÃO",
                    firstNonBlank(s.headline, "Escala alterada"),
                    s.detail,
                    "Confira antes de seguir",
                    MAGENTA
            );
            case "OFF_DUTY" -> new Primary(
                    "VISÃO GERAL",
                    LocalTime.now().format(clockFormatter),
                    "Sem atividade agora",
                    "A próxima programação aparecerá automaticamente.",
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
            facts.add(new Fact(
                    "APZ",
                    s.presentationTime,
                    s.presentationPlace,
                    MAGENTA
            ));
        }

        if (!s.gateLabel().isBlank()) {
            facts.add(new Fact(
                    "PORTÃO",
                    s.remoteStand ? "REMOTA" : s.gate,
                    "",
                    ORANGE
            ));
        }

        if (!s.eta.isBlank() && "IN_FLIGHT".equals(s.state)) {
            facts.add(new Fact("ETA", s.eta, "", CYAN));
        }

        if (!s.nextFlight.isBlank() && !"CONNECTION".equals(s.state)) {
            facts.add(new Fact(
                    "PRÓXIMO",
                    s.nextFlight,
                    s.connection,
                    VIOLET
            ));
        }

        if (!s.overnight.isBlank() && !"OVERNIGHT".equals(s.state)) {
            facts.add(new Fact(
                    "PERNOITE",
                    s.overnight,
                    s.hotelPickup,
                    MAGENTA
            ));
        }

        return facts;
    }

    private void addMiniStat(LinearLayout row, Fact fact) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(4), dp(3), dp(4), dp(3));

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

        row.addView(box, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
    }

    private void requestSync() {
        if (transientStatus != null) transientStatus.setText("Buscando celular…");

        WatchSyncClient.refresh(this, (received, status) -> runOnUiThread(() -> {
            renderSnapshot();
            if (transientStatus != null) transientStatus.setText(status);
        }));
    }

    private void addAccentDivider(int accent) {
        View line = new View(this);
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{Color.TRANSPARENT, accent, Color.TRANSPARENT}
        );
        line.setBackground(background);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(2)
        );
        params.setMargins(dp(12), dp(2), dp(12), dp(2));
        content.addView(line, params);
    }

    private TextView actionChip(String label, int accent, boolean selected) {
        TextView chip = text(label, 9, selected ? WHITE : accent, true, Gravity.CENTER);
        chip.setPadding(dp(12), dp(7), dp(12), dp(7));

        GradientDrawable background = new GradientDrawable();
        background.setColor(selected ? withAlpha(accent, 50) : SURFACE_ALT);
        background.setCornerRadius(dp(20));
        background.setStroke(dp(1), withAlpha(accent, selected ? 190 : 85));
        chip.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(2), dp(3), dp(2), 0);
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
                s.presentationTime.isBlank() ? "" : "APZ " + s.presentationTime,
                s.presentationPlace);
    }

    private static String flightLine(WatchContextSnapshot s) {
        return join(" · ", s.currentFlight, s.currentRoute, s.gateLabel());
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
            this.eyebrow = eyebrow;
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
}
