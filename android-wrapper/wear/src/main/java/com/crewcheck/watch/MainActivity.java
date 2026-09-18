package com.crewcheck.watch;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.crewcheck.watch.data.SnapshotRepository;
import com.crewcheck.watch.data.WatchStateStore;
import com.crewcheck.watch.model.WatchContextSnapshot;
import com.crewcheck.watch.notification.WatchNotificationHelper;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public final class MainActivity extends Activity {
    private static final int BG = Color.rgb(7, 20, 37);
    private static final int SURFACE = Color.rgb(14, 31, 52);
    private static final int SURFACE_ALT = Color.rgb(20, 39, 64);
    private static final int TEXT = Color.rgb(247, 250, 252);
    private static final int MUTED = Color.rgb(169, 183, 198);
    private static final int CYAN = Color.rgb(85, 217, 242);
    private static final int VIOLET = Color.rgb(137, 92, 246);
    private static final int MAGENTA = Color.rgb(242, 85, 164);
    private static final int WARNING = Color.rgb(255, 190, 92);

    private final Handler main = new Handler(Looper.getMainLooper());

    private SnapshotRepository repository;
    private LinearLayout content;
    private TextView clock;
    private TextView syncStatus;
    private Button refreshButton;

    private final Runnable clockTick = new Runnable() {
        @Override
        public void run() {
            if (clock != null) {
                clock.setText(DateTimeFormatter.ofPattern("HH:mm")
                        .withZone(ZoneId.systemDefault())
                        .format(Instant.now()));
            }
            main.postDelayed(this, 30_000L);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        repository = new SnapshotRepository(this);
        WatchNotificationHelper.ensureChannel(this);
        requestNotificationPermissionIfNeeded();
        renderShell();
        render(repository.current());
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        main.removeCallbacks(clockTick);
        main.post(clockTick);
        if (repository != null) render(repository.current());
    }

    @Override
    protected void onPause() {
        main.removeCallbacks(clockTick);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (repository != null) repository.shutdown();
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void renderShell() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(18), dp(12), dp(18), dp(28));
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        TextView brand = text("CREWCHECK", 11, CYAN, true);
        brand.setLetterSpacing(.18f);
        content.addView(brand);

        clock = text("--:--", 27, TEXT, true);
        clock.setPadding(0, dp(1), 0, dp(1));
        content.addView(clock);

        syncStatus = text("Carregando…", 10, MUTED, false);
        syncStatus.setPadding(0, 0, 0, dp(7));
        content.addView(syncStatus);

        refreshButton = new Button(this);
        refreshButton.setText("Atualizar");
        refreshButton.setAllCaps(false);
        refreshButton.setTextColor(TEXT);
        refreshButton.setTextSize(11);
        refreshButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        refreshButton.setMinHeight(0);
        refreshButton.setMinimumHeight(0);
        refreshButton.setPadding(dp(18), 0, dp(18), 0);
        refreshButton.setBackground(rounded(SURFACE_ALT, dp(18), CYAN, 1));
        refreshButton.setOnClickListener(v -> refresh());

        LinearLayout.LayoutParams buttonParams =
                new LinearLayout.LayoutParams(dp(128), dp(38));
        buttonParams.setMargins(0, 0, 0, dp(10));
        content.addView(refreshButton, buttonParams);

        setContentView(scroll);
    }

    private void refresh() {
        refreshButton.setEnabled(false);
        syncStatus.setText(repository.hasRemoteEndpoint()
                ? "Sincronizando…"
                : "Aguardando celular • cache local");

        repository.refresh(new SnapshotRepository.Callback() {
            @Override
            public void onSuccess(WatchStateStore.SavedState state) {
                main.post(() -> {
                    refreshButton.setEnabled(true);
                    render(state);
                });
            }

            @Override
            public void onError(Throwable error, WatchStateStore.SavedState cachedState) {
                main.post(() -> {
                    refreshButton.setEnabled(true);
                    render(cachedState);
                    syncStatus.setText("Sem conexão • último estado salvo");
                });
            }
        });
    }

    private void render(WatchStateStore.SavedState saved) {
        while (content.getChildCount() > 4) {
            content.removeViewAt(4);
        }

        WatchContextSnapshot snapshot = saved.snapshot;
        boolean stale = snapshot.isStale(System.currentTimeMillis());

        if (saved.demoFallback) {
            syncStatus.setText("Modo demonstração • sem escala sincronizada");
        } else if (stale) {
            syncStatus.setText("Dados desatualizados • toque em Atualizar");
        } else {
            String source = "phone-data-item".equals(saved.source)
                    || "phone-message".equals(saved.source)
                    ? "celular"
                    : saved.source;
            syncStatus.setText("Sincronizado • " + source);
        }

        addHero(snapshot, stale || saved.demoFallback);

        addInfoCard(
                "APRESENTAÇÃO",
                value(snapshot.presentationTime),
                value(snapshot.presentationPlace),
                CYAN
        );

        addInfoCard(
                "VOO",
                value(snapshot.currentFlight),
                flightDetail(snapshot),
                VIOLET
        );

        addInfoCard(
                "PORTÃO",
                snapshot.displayGate(),
                "REMOTA".equals(snapshot.displayGate())
                        ? "Embarque em posição remota"
                        : value(snapshot.currentRoute),
                "REMOTA".equals(snapshot.displayGate()) ? WARNING : MAGENTA
        );

        if (!snapshot.connection.isEmpty() || !snapshot.nextFlight.isEmpty()) {
            addInfoCard(
                    "CONEXÃO",
                    value(snapshot.connection),
                    join(snapshot.nextFlight, snapshot.nextDetail),
                    CYAN
            );
        }

        if (!snapshot.overnight.isEmpty() || !snapshot.hotelPickup.isEmpty()) {
            addInfoCard(
                    "PERNOITE",
                    value(snapshot.overnight),
                    value(snapshot.hotelPickup),
                    WARNING
            );
        }

        TextView footer = text(
                saved.demoFallback
                        ? "Exemplo visual — não use como escala operacional"
                        : "O relógio exibe a projeção canônica do CrewCheck",
                9,
                MUTED,
                false
        );
        footer.setPadding(dp(8), dp(8), dp(8), dp(4));
        content.addView(footer);
    }

    private void addHero(WatchContextSnapshot snapshot, boolean warn) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        card.setBackground(rounded(SURFACE_ALT, dp(24), warn ? WARNING : VIOLET, 2));

        TextView label = text(snapshot.nextStepLabel(), 11, warn ? WARNING : MAGENTA, true);
        label.setLetterSpacing(.08f);
        card.addView(label);

        TextView value = text(snapshot.nextStepValue(), 28, TEXT, true);
        value.setPadding(0, dp(1), 0, dp(3));
        card.addView(value);

        TextView detail = text(snapshot.nextStepDetail(), 11, MUTED, false);
        detail.setMaxLines(3);
        card.addView(detail);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(8));
        content.addView(card, params);
    }

    private void addInfoCard(String label, String value, String detail, int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        card.setBackground(rounded(SURFACE, dp(18), Color.TRANSPARENT, 0));

        TextView eyebrow = text(label, 9, accent, true);
        eyebrow.setLetterSpacing(.10f);
        card.addView(eyebrow);

        TextView mainValue = text(value, 20, TEXT, true);
        mainValue.setPadding(0, dp(1), 0, dp(1));
        card.addView(mainValue);

        TextView sub = text(detail, 10, MUTED, false);
        sub.setMaxLines(3);
        card.addView(sub);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(3), 0, dp(3));
        content.addView(card, params);
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value(value));
        view.setTextColor(color);
        view.setTextSize(sp);
        view.setGravity(Gravity.CENTER);
        view.setMaxLines(2);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable rounded(int fill, int radius, int strokeColor, int strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        if (strokeDp > 0 && strokeColor != Color.TRANSPARENT) {
            drawable.setStroke(dp(strokeDp), strokeColor);
        }
        return drawable;
    }

    private static String flightDetail(WatchContextSnapshot snapshot) {
        String eta = snapshot.eta.isEmpty() ? "" : "ETA " + snapshot.eta;
        return join(snapshot.currentRoute, eta);
    }

    private static String join(String first, String second) {
        String a = value(first);
        String b = value(second);
        if ("—".equals(a)) return b;
        if ("—".equals(b)) return a;
        return a + " • " + b;
    }

    private static String value(String value) {
        return value == null || value.isBlank() ? "—" : value;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                8801
        );
    }
}
