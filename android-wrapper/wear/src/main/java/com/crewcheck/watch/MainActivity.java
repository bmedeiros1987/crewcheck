package com.crewcheck.watch;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Glance-first Wear OS interface.
 *
 * The screen shows the next action first and reveals only relevant supporting facts. All operational
 * values come from WatchContextSnapshot; no roster or regulatory calculation lives here.
 */
public final class MainActivity extends Activity {
    private static final int NAVY = Color.rgb(5, 11, 20);
    private static final int SURFACE = Color.rgb(12, 24, 39);
    private static final int SURFACE_ALT = Color.rgb(18, 32, 49);
    private static final int WHITE = Color.rgb(246, 248, 252);
    private static final int MUTED = Color.rgb(158, 171, 190);
    private static final int CYAN = Color.rgb(34, 211, 238);
    private static final int VIOLET = Color.rgb(139, 92, 246);
    private static final int MAGENTA = Color.rgb(236, 72, 153);
    private static final int WARNING = Color.rgb(251, 191, 36);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final DateTimeFormatter clockFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault());
    private final Runnable clockTick = new Runnable() {
        @Override
        public void run() {
            if (clockView != null) clockView.setText(LocalTime.now().format(clockFormatter));
            handler.postDelayed(this, 30_000L);
        }
    };

    private SecureSnapshotStore store;
    private LinearLayout content;
    private TextView clockView;
    private TextView transientStatus;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new SecureSnapshotStore(this);
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.removeCallbacks(clockTick);
        handler.post(clockTick);
        renderSnapshot();
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(clockTick);
        super.onPause();
    }

    private void render() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(NAVY);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        int horizontal = isRoundScreen() ? dp(24) : dp(18);
        content.setPadding(horizontal, dp(10), horizontal, dp(26));
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

        TextView brand = text("CREWCHECK", 11, CYAN, true, Gravity.CENTER);
        brand.setLetterSpacing(.17f);
        content.addView(brand);

        clockView = text(LocalTime.now().format(clockFormatter), 29, WHITE, true, Gravity.CENTER);
        clockView.setPadding(0, dp(2), 0, dp(8));
        content.addView(clockView);

        WatchContextSnapshot snapshot = store.load();
        long now = System.currentTimeMillis();
        if (snapshot == null) {
            renderEmptyState();
        } else {
            renderLiveState(snapshot, now);
        }

        transientStatus = text("", 10, MUTED, false, Gravity.CENTER);
        transientStatus.setPadding(dp(6), dp(8), dp(6), 0);
        content.addView(transientStatus);

        Button sync = actionButton("Sincronizar", VIOLET);
        sync.setOnClickListener(view -> requestSync());
        content.addView(sync);

        if (BuildConfig.DEBUG) {
            Button demo = actionButton("Carregar demonstração", SURFACE_ALT);
            demo.setOnClickListener(view -> {
                store.save(WatchContextSnapshot.demo(System.currentTimeMillis()).toJson().toString());
                renderSnapshot();
                transientStatus.setText("Demonstração local • não operacional");
            });
            content.addView(demo);
        }
    }

    private void renderEmptyState() {
        LinearLayout hero = card(VIOLET);
        hero.addView(text("AINDA SEM ESCALA", 11, MAGENTA, true, Gravity.CENTER));
        TextView title = text("Conecte o celular", 21, WHITE, true, Gravity.CENTER);
        title.setPadding(0, dp(7), 0, dp(5));
        hero.addView(title);
        hero.addView(text(
                "Abra o CrewCheck no celular e toque em Sincronizar.",
                12,
                MUTED,
                false,
                Gravity.CENTER
        ));
        content.addView(hero);
    }

    private void renderLiveState(WatchContextSnapshot snapshot, long now) {
        boolean stale = snapshot.isStale(now);
        int accent = snapshot.changed ? MAGENTA : stale ? WARNING : CYAN;

        LinearLayout hero = card(accent);
        hero.addView(text(
                stale ? "VERIFIQUE NO CELULAR" : stateLabel(snapshot.state),
                10,
                accent,
                true,
                Gravity.CENTER
        ));
        TextView headline = text(snapshot.headline, 21, WHITE, true, Gravity.CENTER);
        headline.setPadding(0, dp(5), 0, 0);
        hero.addView(headline);

        if (!snapshot.primaryTime.isBlank()) {
            TextView time = text(snapshot.primaryTime, 27, WHITE, true, Gravity.CENTER);
            time.setPadding(0, dp(2), 0, dp(2));
            hero.addView(time);
        }
        if (!snapshot.detail.isBlank()) {
            hero.addView(text(snapshot.detail, 12, MUTED, false, Gravity.CENTER));
        }
        content.addView(hero);

        TextView freshness = text(snapshot.statusLabel(now), 10, stale ? WARNING : MUTED, false, Gravity.CENTER);
        freshness.setPadding(0, dp(6), 0, dp(5));
        content.addView(freshness);

        for (Fact fact : factsFor(snapshot)) {
            addFactCard(fact);
        }
    }

    private List<Fact> factsFor(WatchContextSnapshot snapshot) {
        List<Fact> facts = new ArrayList<>();

        if (!snapshot.currentFlight.isBlank() || !snapshot.currentRoute.isBlank()) {
            String value = join(" • ", snapshot.currentFlight, snapshot.currentRoute);
            String detail = join(
                    " • ",
                    snapshot.remoteStand ? "REMOTA" : snapshot.gateLabel(),
                    snapshot.boardingTime.isBlank() ? "" : "Embarque " + snapshot.boardingTime,
                    snapshot.eta.isBlank() ? "" : "ETA " + snapshot.eta
            );
            facts.add(new Fact("VOO", value, detail, snapshot.remoteStand ? WARNING : CYAN));
        }

        if (!snapshot.presentationTime.isBlank() || !snapshot.presentationPlace.isBlank()) {
            facts.add(new Fact(
                    "APRESENTAÇÃO",
                    join(" • ", snapshot.presentationTime, snapshot.presentationPlace),
                    snapshot.leaveTime.isBlank() ? "" : "Sair " + snapshot.leaveTime
                            + (snapshot.trafficDetail.isBlank() ? "" : " • " + snapshot.trafficDetail),
                    VIOLET
            ));
        }

        if (!snapshot.connection.isBlank() || !snapshot.nextFlight.isBlank()) {
            facts.add(new Fact(
                    "CONEXÃO",
                    join(" • ", snapshot.connection, snapshot.nextFlight),
                    snapshot.nextDetail,
                    CYAN
            ));
        }

        if (!snapshot.overnight.isBlank() || !snapshot.hotelPickup.isBlank()) {
            facts.add(new Fact(
                    "PERNOITE",
                    snapshot.overnight,
                    snapshot.hotelPickup,
                    MAGENTA
            ));
        }

        return facts;
    }

    private void addFactCard(Fact fact) {
        LinearLayout card = card(fact.accent);
        card.addView(text(fact.label, 9, fact.accent, true, Gravity.CENTER));
        if (!fact.value.isBlank()) {
            TextView value = text(fact.value, 16, WHITE, true, Gravity.CENTER);
            value.setPadding(0, dp(3), 0, dp(1));
            card.addView(value);
        }
        if (!fact.detail.isBlank()) {
            card.addView(text(fact.detail, 11, MUTED, false, Gravity.CENTER));
        }
        content.addView(card);
    }

    private void requestSync() {
        transientStatus.setText("Procurando o celular…");
        WatchSyncClient.refresh(this, (received, status) -> runOnUiThread(() -> {
            renderSnapshot();
            transientStatus.setText(status);
        }));
    }

    private LinearLayout card(int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(dp(14), dp(12), dp(14), dp(12));

        GradientDrawable background = new GradientDrawable();
        background.setColor(SURFACE);
        background.setCornerRadius(dp(18));
        background.setStroke(dp(1), withAlpha(accent, 115));
        card.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(5), 0, dp(5));
        card.setLayoutParams(params);
        return card;
    }

    private Button actionButton(String label, int accent) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(WHITE);
        button.setTextSize(11);
        button.setAllCaps(false);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(dp(14), 0, dp(14), 0);

        GradientDrawable background = new GradientDrawable();
        background.setColor(accent);
        background.setCornerRadius(dp(22));
        button.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(174), dp(42));
        params.setMargins(0, dp(7), 0, 0);
        button.setLayoutParams(params);
        return button;
    }

    private TextView text(String value, int sp, int color, boolean bold, int gravity) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(sp);
        view.setGravity(gravity);
        view.setMaxLines(3);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        return view;
    }

    private boolean isRoundScreen() {
        return (getResources().getConfiguration().screenLayout
                & Configuration.SCREENLAYOUT_ROUND_MASK) == Configuration.SCREENLAYOUT_ROUND_YES;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
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

    private static String stateLabel(String state) {
        return switch (state) {
            case "LEAVE_SOON" -> "PRÓXIMO PASSO";
            case "REPORTING" -> "APRESENTAÇÃO";
            case "BOARDING" -> "EMBARQUE";
            case "IN_FLIGHT" -> "EM VOO";
            case "CONNECTION" -> "CONEXÃO";
            case "OVERNIGHT" -> "PERNOITE";
            case "CHANGED" -> "ALTERAÇÃO";
            case "OFF_DUTY" -> "FOLGA";
            default -> "CREWCHECK";
        };
    }

    private static final class Fact {
        final String label;
        final String value;
        final String detail;
        final int accent;

        Fact(String label, String value, String detail, int accent) {
            this.label = label;
            this.value = value;
            this.detail = detail;
            this.accent = accent;
        }
    }
}
