package com.crewcheck.watch;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int BG = Color.rgb(5, 11, 20);
    private static final int CARD = Color.rgb(12, 24, 36);
    private static final int TEXT = Color.rgb(245, 248, 250);
    private static final int MUTED = Color.rgb(166, 178, 190);
    private static final int TEAL = Color.rgb(40, 215, 192);
    private static final int GREEN = Color.rgb(91, 226, 118);
    private static final int ORANGE = Color.rgb(255, 177, 66);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout content;
    private TextView syncStatus;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        renderShell();
        refresh();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void renderShell() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(18);
        content.setPadding(pad, dp(10), pad, dp(24));
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));

        TextView brand = label("CREWWATCH", 12, TEAL, true);
        brand.setLetterSpacing(.18f);
        content.addView(brand);

        TextView clock = label(LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")), 26, TEXT, true);
        clock.setPadding(0, dp(2), 0, dp(4));
        content.addView(clock);

        syncStatus = label("Sincronizando…", 10, MUTED, false);
        content.addView(syncStatus);

        Button refresh = new Button(this);
        refresh.setText("Atualizar");
        refresh.setTextColor(TEXT);
        refresh.setTextSize(11);
        refresh.setAllCaps(false);
        refresh.setBackgroundColor(Color.rgb(18, 48, 56));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(dp(132), dp(42));
        buttonParams.setMargins(0, dp(8), 0, dp(10));
        refresh.setLayoutParams(buttonParams);
        refresh.setOnClickListener(v -> refresh());
        content.addView(refresh);

        setContentView(scroll);
    }

    private void refresh() {
        syncStatus.setText("Sincronizando…");
        executor.execute(() -> {
            try {
                CrewWatchState state = BuildConfig.CREWCHECK_WATCH_ENDPOINT.isBlank()
                        ? CrewWatchState.demo()
                        : loadRemoteState();
                main.post(() -> renderState(state));
            } catch (Exception error) {
                main.post(() -> {
                    syncStatus.setText("Sem conexão • mostrando dados demo");
                    renderState(CrewWatchState.demo());
                });
            }
        });
    }

    private CrewWatchState loadRemoteState() throws Exception {
        URL url = new URL(BuildConfig.CREWCHECK_WATCH_ENDPOINT);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(7000);
        connection.setReadTimeout(7000);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/json");
        if (!BuildConfig.CREWCHECK_WATCH_TOKEN.isBlank()) {
            connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.CREWCHECK_WATCH_TOKEN);
        }

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);

        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
        } finally {
            connection.disconnect();
        }
        return CrewWatchState.fromJson(new JSONObject(body.toString()));
    }

    private void renderState(CrewWatchState state) {
        while (content.getChildCount() > 4) content.removeViewAt(4);
        syncStatus.setText(state.demo ? "Modo demo • endpoint não configurado" : "Sincronizado agora");

        addCard("APRESENTAÇÃO", state.presentationTime, state.presentationPlace, TEAL);
        addCard("HORA DE SAIR", state.leaveTime, state.trafficDetail, GREEN);
        addCard("VOO ATUAL", state.currentFlight, state.currentRoute + " • ETA " + state.eta, TEXT);
        addCard("CONEXÃO", state.connection, state.nextFlight + " • " + state.nextDetail, TEAL);
        addCard("PERNOITE", state.overnight, state.hotelPickup, ORANGE);
    }

    private void addCard(String eyebrow, String mainValue, String detail, int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(14), dp(11), dp(14), dp(11));
        card.setBackgroundColor(CARD);

        TextView top = label(eyebrow, 9, accent, true);
        top.setLetterSpacing(.12f);
        card.addView(top);

        TextView value = label(mainValue, 22, TEXT, true);
        value.setPadding(0, dp(2), 0, dp(2));
        card.addView(value);

        TextView sub = label(detail, 11, MUTED, false);
        sub.setGravity(Gravity.CENTER);
        card.addView(sub);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(4), 0, dp(4));
        card.setLayoutParams(params);
        card.setOnClickListener(v -> toggleDetail(sub));
        content.addView(card);
    }

    private void toggleDetail(TextView detail) {
        detail.setVisibility(detail.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
    }

    private TextView label(String text, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text == null || text.isBlank() ? "—" : text);
        view.setTextColor(color);
        view.setTextSize(sp);
        view.setGravity(Gravity.CENTER);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    static final class CrewWatchState {
        final boolean demo;
        final String presentationTime;
        final String presentationPlace;
        final String leaveTime;
        final String trafficDetail;
        final String currentFlight;
        final String currentRoute;
        final String eta;
        final String connection;
        final String nextFlight;
        final String nextDetail;
        final String overnight;
        final String hotelPickup;

        CrewWatchState(boolean demo, String presentationTime, String presentationPlace, String leaveTime,
                       String trafficDetail, String currentFlight, String currentRoute, String eta,
                       String connection, String nextFlight, String nextDetail, String overnight,
                       String hotelPickup) {
            this.demo = demo;
            this.presentationTime = presentationTime;
            this.presentationPlace = presentationPlace;
            this.leaveTime = leaveTime;
            this.trafficDetail = trafficDetail;
            this.currentFlight = currentFlight;
            this.currentRoute = currentRoute;
            this.eta = eta;
            this.connection = connection;
            this.nextFlight = nextFlight;
            this.nextDetail = nextDetail;
            this.overnight = overnight;
            this.hotelPickup = hotelPickup;
        }

        static CrewWatchState fromJson(JSONObject json) {
            return new CrewWatchState(false,
                    json.optString("presentationTime", "—"),
                    json.optString("presentationPlace", "—"),
                    json.optString("leaveTime", "—"),
                    json.optString("trafficDetail", "—"),
                    json.optString("currentFlight", "—"),
                    json.optString("currentRoute", "—"),
                    json.optString("eta", "—"),
                    json.optString("connection", "—"),
                    json.optString("nextFlight", "—"),
                    json.optString("nextDetail", "—"),
                    json.optString("overnight", "—"),
                    json.optString("hotelPickup", "—"));
        }

        static CrewWatchState demo() {
            return new CrewWatchState(true,
                    "12:45",
                    "CGH • apresentação",
                    "11:30",
                    "Trânsito normal • 38 min",
                    "LA3149",
                    "POA → CGH",
                    "14:50",
                    "1h20",
                    "LA3102",
                    "Gate 24 • embarque 15:35",
                    "GYN",
                    "Hotel confirmado • pickup 09:20");
        }
    }
}
