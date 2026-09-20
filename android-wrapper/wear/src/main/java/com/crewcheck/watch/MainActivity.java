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
 * CrewWatch v2.
 *
 * Glance-first UI: one primary action, at most two supporting facts, no mobile-style dashboard.
 * All operational values are read-only projections from WatchContextSnapshot.
 */
public final class MainActivity extends FragmentActivity
        implements AmbientModeSupport.AmbientCallbackProvider {

    private static final int NAVY = Color.rgb(5, 11, 20);
    private static final int BLACK = Color.BLACK;
    private static final int SURFACE = Color.rgb(12, 24, 39);
    private static final int SURFACE_ALT = Color.rgb(17, 31, 49);
    private static final int WHITE = Color.rgb(247, 249, 252);
    private static final int MUTED = Color.rgb(155, 171, 192);
    private static final int MUTED_AMBIENT = Color.rgb(145, 145, 145);
    private static final int CYAN = Color.rgb(34, 211, 238);
    private static final int VIOLET = Color.rgb(139, 92, 246);
    private static final int MAGENTA = Color.rgb(236, 72, 153);
    private static final int SUCCESS = Color.rgb(52, 211, 153);
    private static final int WARNING = Color.rgb(251, 191, 36);

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Galaxy Watch can expose orientation changes while the wrist moves.
        // CrewWatch is a round/square watch UI, never a landscape phone surface.
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
        int horizontal = isRoundScreen() ? dp(38) : dp(20);
        int topSafe = isRoundScreen() ? dp(24) : dp(10);
        int bottomSafe = isRoundScreen() ? dp(34) : dp(22);
        content.setPadding(horizontal, topSafe, horizontal, bottomSafe);

        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));
        setContentView(scroll);
        renderSnapshot();
    }

    private void renderSnapshot() {
        if (content == null) return;

        content.removeAllViews();
        content.getRootView().setBackgroundColor(ambient ? BLACK : NAVY);
        WatchContextSnapshot snapshot = store.load();
        long now = System.currentTimeMillis();

        if (ambient) {
            renderAmbient(snapshot, now);
            return;
        }

        renderHeader();

        if (snapshot == null) {
            renderEmptyState();
        } else {
            renderLiveState(snapshot, now);
        }

        transientStatus = text("", 9, MUTED, false, Gravity.CENTER);
        transientStatus.setPadding(dp(6), dp(5), dp(6), 0);
        content.addView(transientStatus);

        TextView sync = actionChip("Sincronizar");
        sync.setOnClickListener(view -> requestSync());
        content.addView(sync);

        if (BuildConfig.DEBUG) {
            TextView demo = text("Demonstração", 9, MUTED, false, Gravity.CENTER);
            demo.setPadding(dp(8), dp(8), dp(8), dp(8));
            demo.setOnClickListener(view -> {
                store.save(WatchContextSnapshot.demo(System.currentTimeMillis()).toJson().toString());
                renderSnapshot();
                if (transientStatus != null) {
                    transientStatus.setText("Demo local · não operacional");
                }
            });
            content.addView(demo);
        }
    }

    private void renderHeader() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        TextView brand = text("CREWCHECK", 9, CYAN, true, Gravity.START);
        brand.setLetterSpacing(.15f);
        row.addView(brand, new LinearLayout.LayoutParams(0, dp(28), 1f));

        clockView = text(LocalTime.now().format(clockFormatter), 10, MUTED, true, Gravity.END);
        row.addView(clockView, new LinearLayout.LayoutParams(dp(56), dp(28)));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(28)
        );
        params.setMargins(dp(4), 0, dp(4), dp(2));
        row.setLayoutParams(params);
        content.addView(row);
    }

    private void renderAmbient(WatchContextSnapshot snapshot, long now) {
        content.setPadding(isRoundScreen() ? dp(42) : dp(28), dp(46),
                isRoundScreen() ? dp(42) : dp(28), dp(28));

        TextView time = text(LocalTime.now().format(clockFormatter), 12,
                MUTED_AMBIENT, false, Gravity.CENTER);
        time.setPadding(0, 0, 0, dp(20));
        content.addView(time);

        if (snapshot == null || snapshot.isStale(now)) {
            content.addView(text("CREWCHECK", 10, WHITE, true, Gravity.CENTER));
            TextView value = text("Abra o celular", 21, WHITE, true, Gravity.CENTER);
            value.setPadding(0, dp(8), 0, 0);
            content.addView(value);
            return;
        }

        Primary primary = primaryFor(snapshot);
        content.addView(text(primary.eyebrow, 9, MUTED_AMBIENT, true, Gravity.CENTER));

        TextView value = text(primary.value, primary.value.length() > 12 ? 21 : 29,
                WHITE, true, Gravity.CENTER);
        value.setPadding(0, dp(7), 0, dp(4));
        content.addView(value);

        if (!primary.detail.isBlank()) {
            TextView detail = text(primary.detail, 10, MUTED_AMBIENT, false, Gravity.CENTER);
            detail.setMaxLines(2);
            content.addView(detail);
        }
    }

    private void renderEmptyState() {
        LinearLayout hero = heroCard(VIOLET);
        hero.addView(text("AINDA NÃO CONECTADO", 9, VIOLET, true, Gravity.CENTER));

        TextView title = text("Abra no celular", 18, WHITE, true, Gravity.CENTER);
        title.setPadding(0, dp(7), 0, dp(3));
        title.setMaxLines(2);
        hero.addView(title);

        TextView detail = text(
                "Abra o CrewCheck no celular e sincronize o relógio.",
                10,
                MUTED,
                false,
                Gravity.CENTER
        );
        detail.setMaxLines(3);
        hero.addView(detail);
        content.addView(hero);
    }

    private void renderLiveState(WatchContextSnapshot snapshot, long now) {
        boolean stale = snapshot.isStale(now);
        Primary primary = primaryFor(snapshot);
        int accent = snapshot.changed ? MAGENTA : stale ? WARNING : primary.accent;

        LinearLayout hero = heroCard(accent);
        hero.addView(text(
                stale ? "DADOS ANTIGOS" : primary.eyebrow,
                9,
                accent,
                true,
                Gravity.CENTER
        ));

        TextView value = text(
                stale ? "Confira no celular" : primary.value,
                primary.value.length() > 14 ? 20 : 27,
                WHITE,
                true,
                Gravity.CENTER
        );
        value.setPadding(0, dp(7), 0, dp(3));
        hero.addView(value);

        if (!primary.detail.isBlank()) {
            TextView detail = text(primary.detail, 10, stale ? WARNING : WHITE,
                    false, Gravity.CENTER);
            detail.setMaxLines(2);
            hero.addView(detail);
        }

        if (!primary.secondary.isBlank()) {
            TextView secondary = text(primary.secondary, 9, MUTED,
                    false, Gravity.CENTER);
            secondary.setPadding(0, dp(5), 0, 0);
            secondary.setMaxLines(2);
            hero.addView(secondary);
        }
        content.addView(hero);

        TextView freshness = text(snapshot.statusLabel(now), 8,
                stale ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(4), 0, dp(3));
        content.addView(freshness);

        int added = 0;
        for (Fact fact : secondaryFacts(snapshot)) {
            if (added >= 2) break;
            addCompactFact(fact);
            added += 1;
        }
    }

    private Primary primaryFor(WatchContextSnapshot s) {
        return switch (s.state) {
            case "LEAVE_SOON" -> new Primary(
                    "HORA DE SAIR",
                    firstNonBlank(s.leaveTime, s.primaryTime, s.headline),
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
                    join(" · ", s.currentRoute, s.eta.isBlank() ? "" : "ETA " + s.eta),
                    connectionLine(s),
                    CYAN
            );
            case "CONNECTION" -> new Primary(
                    "CONEXÃO",
                    firstNonBlank(s.connection, s.headline),
                    join(" · ", s.nextFlight, s.nextDetail),
                    s.boardingTime.isBlank() ? "" : "Embarque " + s.boardingTime,
                    CYAN
            );
            case "OVERNIGHT" -> new Primary(
                    "PERNOITE",
                    firstNonBlank(s.overnight, s.headline),
                    s.hotelPickup,
                    presentationLine(s),
                    WARNING
            );
            case "CHANGED" -> new Primary(
                    "ALTERAÇÃO",
                    firstNonBlank(s.headline, "Escala alterada"),
                    s.detail,
                    "Confira antes de seguir",
                    MAGENTA
            );
            case "OFF_DUTY" -> new Primary(
                    "FOLGA",
                    firstNonBlank(s.headline, "Nada agora"),
                    s.detail,
                    "Só o que for importante aparece aqui.",
                    VIOLET
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

        if (!s.presentationTime.isBlank()
                && !"REPORTING".equals(s.state)
                && !"LEAVE_SOON".equals(s.state)) {
            facts.add(new Fact(
                    "APRESENTAÇÃO",
                    join(" · ", s.presentationTime, s.presentationPlace),
                    "",
                    VIOLET
            ));
        }

        if ((!s.currentFlight.isBlank() || !s.currentRoute.isBlank())
                && !"IN_FLIGHT".equals(s.state)
                && !"BOARDING".equals(s.state)) {
            facts.add(new Fact(
                    "VOO",
                    join(" · ", s.currentFlight, s.currentRoute),
                    join(" · ", s.gateLabel(),
                            s.eta.isBlank() ? "" : "ETA " + s.eta),
                    CYAN
            ));
        }

        if ((!s.connection.isBlank() || !s.nextFlight.isBlank())
                && !"CONNECTION".equals(s.state)) {
            facts.add(new Fact(
                    "DEPOIS",
                    join(" · ", s.connection, s.nextFlight),
                    s.nextDetail,
                    CYAN
            ));
        }

        if ((!s.overnight.isBlank() || !s.hotelPickup.isBlank())
                && !"OVERNIGHT".equals(s.state)) {
            facts.add(new Fact(
                    "PERNOITE",
                    s.overnight,
                    s.hotelPickup,
                    WARNING
            ));
        }

        return facts;
    }

    private void addCompactFact(Fact fact) {
        LinearLayout card = compactCard(fact.accent);
        card.addView(text(fact.label, 8, fact.accent, true, Gravity.CENTER));

        if (!fact.value.isBlank()) {
            TextView value = text(fact.value, 14, WHITE, true, Gravity.CENTER);
            value.setPadding(0, dp(3), 0, 0);
            value.setMaxLines(2);
            card.addView(value);
        }

        if (!fact.detail.isBlank()) {
            TextView detail = text(fact.detail, 9, MUTED, false, Gravity.CENTER);
            detail.setPadding(0, dp(2), 0, 0);
            detail.setMaxLines(2);
            card.addView(detail);
        }
        content.addView(card);
    }

    private void requestSync() {
        if (transientStatus != null) transientStatus.setText("Buscando celular…");

        WatchSyncClient.refresh(this, (received, status) -> runOnUiThread(() -> {
            renderSnapshot();
            if (transientStatus != null) transientStatus.setText(status);
        }));
    }

    private LinearLayout heroCard(int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(dp(12), dp(12), dp(12), dp(11));

        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{SURFACE_ALT, SURFACE}
        );
        background.setCornerRadius(dp(26));
        background.setStroke(dp(1), withAlpha(accent, 150));
        card.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(4), 0, dp(4));
        card.setLayoutParams(params);
        return card;
    }

    private LinearLayout compactCard(int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(dp(12), dp(9), dp(12), dp(9));

        GradientDrawable background = new GradientDrawable();
        background.setColor(SURFACE);
        background.setCornerRadius(dp(18));
        background.setStroke(dp(1), withAlpha(accent, 70));
        card.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(4), dp(3), dp(4), dp(3));
        card.setLayoutParams(params);
        return card;
    }

    private TextView actionChip(String label) {
        TextView chip = text(label, 10, CYAN, true, Gravity.CENTER);
        chip.setPadding(dp(16), dp(9), dp(16), dp(9));

        GradientDrawable background = new GradientDrawable();
        background.setColor(SURFACE_ALT);
        background.setCornerRadius(dp(22));
        background.setStroke(dp(1), withAlpha(CYAN, 95));
        chip.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(4), 0, 0);
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
                s.presentationTime.isBlank() ? "" : "Apresentação " + s.presentationTime,
                s.presentationPlace);
    }

    private static String flightLine(WatchContextSnapshot s) {
        return join(" · ", s.currentFlight, s.currentRoute, s.gateLabel());
    }

    private static String connectionLine(WatchContextSnapshot s) {
        if (s.connection.isBlank() && s.nextFlight.isBlank()) return "";
        return join(" · ",
                s.connection.isBlank() ? "" : "Conexão " + s.connection,
                s.nextFlight);
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
            this.value = value;
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
