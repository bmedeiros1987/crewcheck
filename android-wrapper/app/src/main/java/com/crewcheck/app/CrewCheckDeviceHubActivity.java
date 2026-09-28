package com.crewcheck.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Phone-owned native diagnostics for CrewWatch.
 *
 * The hub intentionally displays only device/app telemetry and snapshot freshness. It never
 * exposes roster contents, credentials or raw health data, and it does not own any watch UI.
 */
public final class CrewCheckDeviceHubActivity extends Activity {
    private static final int NAVY = Color.rgb(3, 10, 22);
    private static final int SURFACE = Color.rgb(9, 24, 45);
    private static final int SURFACE_ALT = Color.rgb(13, 33, 60);
    private static final int WHITE = Color.rgb(248, 250, 252);
    private static final int MUTED = Color.rgb(156, 170, 194);
    private static final int CYAN = Color.rgb(34, 211, 238);
    private static final int GREEN = Color.rgb(52, 211, 153);
    private static final int AMBER = Color.rgb(251, 191, 36);
    private static final long STATUS_TIMEOUT_MS = 5_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout content;
    private int connectedCount = -1;
    private boolean requestInFlight;
    private long requestStartedAtEpochMs;
    private String requestMessage = "";
    private BroadcastReceiver statusReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(NAVY);
        getWindow().setNavigationBarColor(NAVY);
        buildRoot();
        registerStatusReceiver();
        render();
        refreshStatus(false);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (statusReceiver != null) {
            try { unregisterReceiver(statusReceiver); } catch (Exception ignored) {}
            statusReceiver = null;
        }
        super.onDestroy();
    }

    private void buildRoot() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(NAVY);
        scroll.setVerticalScrollBarEnabled(false);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(24), dp(22), dp(34));
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));
        setContentView(scroll);
    }

    private void registerStatusReceiver() {
        statusReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                CrewCheckWatchDeviceTelemetry.Status status = CrewCheckWatchDeviceTelemetry.loadStatus(context);
                if (status == null || status.updatedAtEpochMs < requestStartedAtEpochMs) return;

                if (requestInFlight && !status.verifiedRoundTrip) {
                    requestMessage = "CrewWatch respondeu, aguardando confirmação segura deste teste…";
                    render();
                    return;
                }

                requestInFlight = false;
                if (status.verifiedRoundTrip) {
                    requestMessage = status.roundTripMs >= 0L
                            ? "CrewWatch respondeu e confirmou o teste em " + status.roundTripMs + " ms."
                            : "CrewWatch respondeu e confirmou o teste.";
                } else {
                    requestMessage = "CrewWatch respondeu, mas esta versão ainda não confirmou o teste correlacionado.";
                }
                render();
            }
        };
        IntentFilter filter = new IntentFilter(CrewCheckWatchDeviceTelemetry.ACTION_DEVICE_STATUS_UPDATED);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(statusReceiver, filter);
        }
    }

    private void refreshStatus(boolean includeSnapshotTest) {
        if (requestInFlight) return;
        requestInFlight = true;
        requestStartedAtEpochMs = System.currentTimeMillis();
        requestMessage = includeSnapshotTest
                ? "Testando comunicação e reenviando o último snapshot validado…"
                : "Consultando o CrewWatch…";
        if (includeSnapshotTest) CrewCheckWatchPublisher.republishLast(this);
        render();

        CrewCheckWatchDeviceTelemetry.requestStatus(this, (ok, count, message) -> runOnUiThread(() -> {
            connectedCount = count;
            requestMessage = message == null ? "" : message;
            if (!ok) requestInFlight = false;
            render();
            if (ok) {
                final long expectedRequestStart = requestStartedAtEpochMs;
                handler.postDelayed(() -> {
                    if (!requestInFlight || requestStartedAtEpochMs != expectedRequestStart) return;
                    CrewCheckWatchDeviceTelemetry.Status status = CrewCheckWatchDeviceTelemetry.loadStatus(this);
                    boolean answeredThisRequest = status != null
                            && status.updatedAtEpochMs >= expectedRequestStart;
                    requestInFlight = false;
                    if (!answeredThisRequest) {
                        requestMessage = "O telefone alcançou o Wear OS, mas o CrewWatch não confirmou este teste. Abra o CrewWatch no relógio e tente novamente.";
                    } else if (!status.verifiedRoundTrip) {
                        requestMessage = "CrewWatch respondeu, mas esta versão não confirmou o teste correlacionado. Atualize o CrewWatch para validar o round-trip.";
                    } else {
                        requestMessage = status.roundTripMs >= 0L
                                ? "CrewWatch respondeu e confirmou o teste em " + status.roundTripMs + " ms."
                                : "CrewWatch respondeu e confirmou o teste.";
                    }
                    render();
                }, STATUS_TIMEOUT_MS);
            }
        }));
    }

    private void render() {
        if (content == null) return;
        content.removeAllViews();

        TextView eyebrow = text("CREWCHECK • PERIFÉRICOS", 11, CYAN, true);
        content.addView(eyebrow);

        TextView title = text("Meus dispositivos", 27, WHITE, true);
        title.setPadding(0, dp(4), 0, 0);
        content.addView(title);

        TextView subtitle = text(
                "Estado real do CrewWatch, sem menus técnicos e sem expor sua escala ou dados de saúde.",
                14,
                MUTED,
                false
        );
        subtitle.setPadding(0, dp(6), 0, dp(18));
        content.addView(subtitle);

        CrewCheckWatchDeviceTelemetry.Status status = CrewCheckWatchDeviceTelemetry.loadStatus(this);
        long now = System.currentTimeMillis();
        boolean recent = status != null && status.updatedAtEpochMs > 0L
                && now - status.updatedAtEpochMs <= 5 * 60_000L;

        LinearLayout hero = card();
        String heroTitle;
        String heroDetail;
        int heroAccent;
        if (connectedCount == 0) {
            heroTitle = "Nenhum relógio conectado";
            heroDetail = "Conecte o Galaxy Watch ao telefone e abra o CrewWatch pelo menos uma vez.";
            heroAccent = AMBER;
        } else if (recent) {
            heroTitle = "CrewWatch conectado";
            heroDetail = status.model.isBlank() ? "Wear OS respondeu agora" : status.model;
            heroAccent = GREEN;
        } else if (status != null) {
            heroTitle = "CrewWatch conhecido";
            heroDetail = "Última resposta " + relativeTime(status.updatedAtEpochMs, now);
            heroAccent = AMBER;
        } else {
            heroTitle = requestInFlight ? "Procurando CrewWatch…" : "CrewWatch ainda não identificado";
            heroDetail = connectedCount > 0
                    ? "O telefone vê um Wear OS, aguardando resposta do app CrewWatch."
                    : "Toque em Atualizar status para testar a conexão.";
            heroAccent = requestInFlight ? CYAN : MUTED;
        }
        TextView heroStatus = text(heroTitle, 20, heroAccent, true);
        hero.addView(heroStatus);
        TextView heroSub = text(heroDetail, 14, WHITE, false);
        heroSub.setPadding(0, dp(4), 0, 0);
        hero.addView(heroSub);
        content.addView(hero, cardParams());

        if (status != null) {
            LinearLayout device = card();
            sectionTitle(device, "RELÓGIO");
            metric(device, "Modelo", valueOr(status.model, status.nodeName, "Galaxy Watch / Wear OS"));
            metric(device, "CrewWatch", status.appVersionName.isBlank()
                    ? "Versão não informada"
                    : status.appVersionName + (status.appVersionCode > 0 ? " · " + status.appVersionCode : ""));
            metric(device, "Bateria", status.batteryPercent >= 0 ? status.batteryPercent + "%" : "Não informada");
            String geometry = status.screenWidthDp > 0 && status.screenHeightDp > 0
                    ? status.screenWidthDp + "×" + status.screenHeightDp + " dp" + (status.round ? " · redondo" : "")
                    : (status.round ? "Tela redonda" : "Tela Wear OS");
            metric(device, "Tela", geometry);
            content.addView(device, cardParams());

            LinearLayout sync = card();
            sectionTitle(sync, "SINCRONIZAÇÃO");
            String snapshotState;
            int syncAccent;
            if (!status.hasSnapshot()) {
                snapshotState = "Ainda sem escala no relógio";
                syncAccent = AMBER;
            } else if (status.snapshotIsStale(now)) {
                snapshotState = "Offline / dados antigos";
                syncAccent = AMBER;
            } else {
                snapshotState = "Escala atualizada";
                syncAccent = GREEN;
            }
            TextView syncState = text(snapshotState, 18, syncAccent, true);
            sync.addView(syncState);
            if (status.hasSnapshot()) {
                metric(sync, "Último snapshot", absoluteTime(status.snapshotGeneratedAtEpochMs));
                metric(sync, "Validade", absoluteTime(status.snapshotValidUntilEpochMs));
            }
            metric(sync, "Último contato", absoluteTime(status.updatedAtEpochMs));
            metric(sync, "Último teste", status.verifiedRoundTrip
                    ? (status.roundTripMs >= 0L ? "Verificado · " + status.roundTripMs + " ms" : "Verificado")
                    : "Não verificado");
            content.addView(sync, cardParams());
        }

        if (!requestMessage.isBlank()) {
            TextView message = text(requestMessage, 13, requestMessage.contains("não") ? AMBER : MUTED, false);
            message.setPadding(dp(3), dp(2), dp(3), dp(12));
            content.addView(message);
        }

        Button test = button("Testar sincronização", CYAN, NAVY);
        test.setEnabled(!requestInFlight);
        test.setOnClickListener(view -> refreshStatus(true));
        content.addView(test, buttonParams());

        Button refresh = button("Atualizar status", SURFACE_ALT, WHITE);
        refresh.setEnabled(!requestInFlight);
        refresh.setOnClickListener(view -> refreshStatus(false));
        LinearLayout.LayoutParams refreshParams = buttonParams();
        refreshParams.setMargins(0, dp(10), 0, 0);
        content.addView(refresh, refreshParams);

        TextView privacy = text(
                "Privacidade: este painel guarda apenas modelo, versão, bateria e horários de sincronização. Não recebe PDF, conteúdo da escala, credenciais nem dados brutos de saúde.",
                12,
                MUTED,
                false
        );
        privacy.setPadding(0, dp(18), 0, 0);
        content.addView(privacy);
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(17), dp(16), dp(17), dp(16));
        GradientDrawable background = new GradientDrawable();
        background.setColor(SURFACE);
        background.setCornerRadius(dp(22));
        background.setStroke(dp(1), Color.rgb(24, 50, 78));
        card.setBackground(background);
        return card;
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(12));
        return params;
    }

    private void sectionTitle(LinearLayout parent, String value) {
        TextView title = text(value, 10, CYAN, true);
        title.setPadding(0, 0, 0, dp(7));
        parent.addView(title);
    }

    private void metric(LinearLayout parent, String label, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(5), 0, dp(5));

        TextView labelView = text(label, 13, MUTED, false);
        row.addView(labelView, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView valueView = text(value, 13, WHITE, true);
        valueView.setGravity(Gravity.END);
        row.addView(valueView, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.3f));
        parent.addView(row);
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        view.setLineSpacing(0f, 1.08f);
        return view;
    }

    private Button button(String label, int backgroundColor, int textColor) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(15);
        button.setTextColor(textColor);
        button.setAllCaps(false);
        button.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        GradientDrawable background = new GradientDrawable();
        background.setColor(backgroundColor);
        background.setCornerRadius(dp(18));
        button.setBackground(background);
        return button;
    }

    private LinearLayout.LayoutParams buttonParams() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(54)
        );
    }

    private String absoluteTime(long epochMs) {
        if (epochMs <= 0L) return "—";
        return DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, new Locale("pt", "BR"))
                .format(new Date(epochMs));
    }

    private String relativeTime(long epochMs, long now) {
        if (epochMs <= 0L) return "desconhecida";
        long minutes = Math.max(0L, (now - epochMs) / 60_000L);
        if (minutes < 1L) return "agora";
        if (minutes < 60L) return "há " + minutes + " min";
        long hours = minutes / 60L;
        if (hours < 24L) return "há " + hours + " h";
        return absoluteTime(epochMs);
    }

    private String valueOr(String first, String second, String fallback) {
        if (first != null && !first.isBlank()) return first;
        if (second != null && !second.isBlank()) return second;
        return fallback;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
