package com.crewcheck.life;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

public final class MainActivity extends Activity {
    private LinearLayout content;
    private TextView statusView;
    private TextView summaryView;
    private Button connectButton;
    private Button refreshButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(5, 16, 31));
        getWindow().setNavigationBarColor(Color.rgb(5, 16, 31));
        render();
        RefreshScheduler.schedule(this);
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    private void render() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(5, 16, 31));
        scroll.setFillViewport(true);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(28), dp(22), dp(32));
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));
        setContentView(scroll);

        TextView brand = text("CrewCheck", 14, Color.rgb(103, 232, 249), true);
        content.addView(brand);

        TextView title = text("CrewLife Companion", 28, Color.WHITE, true);
        title.setPadding(0, dp(8), 0, dp(4));
        content.addView(title);

        TextView subtitle = text(
                "Sincronização automática e local com Samsung Health",
                14,
                Color.rgb(191, 209, 227),
                false
        );
        subtitle.setPadding(0, 0, 0, dp(18));
        content.addView(subtitle);

        LinearLayout statusCard = card(Color.rgb(34, 211, 238));
        statusView = text("Verificando Samsung Health…", 16, Color.WHITE, true);
        statusCard.addView(statusView);
        TextView privacy = text(
                "O Companion lê somente os tipos que você autorizar. O CrewCheck recebe um resumo local; séries brutas não são enviadas.",
                12,
                Color.rgb(191, 209, 227),
                false
        );
        privacy.setPadding(0, dp(7), 0, 0);
        statusCard.addView(privacy);
        content.addView(statusCard, cardParams());

        connectButton = new Button(this);
        connectButton.setText("Conectar Samsung Health");
        connectButton.setOnClickListener(v -> requestPermissionsAndRefresh());
        content.addView(connectButton, buttonParams());

        refreshButton = new Button(this);
        refreshButton.setText("Atualizar agora");
        refreshButton.setOnClickListener(v -> refreshSummary());
        content.addView(refreshButton, buttonParams());

        LinearLayout summaryCard = card(Color.rgb(139, 92, 246));
        TextView summaryTitle = text("Resumo automático", 14, Color.rgb(196, 181, 253), true);
        summaryCard.addView(summaryTitle);
        summaryView = text("Ainda sem dados.", 15, Color.WHITE, false);
        summaryView.setPadding(0, dp(8), 0, 0);
        summaryCard.addView(summaryView);
        content.addView(summaryCard, cardParams());

        TextView footer = text(
                "Uso de bem-estar e rotina. Não é avaliação médica nem decisão operacional.",
                11,
                Color.rgb(148, 163, 184),
                false
        );
        footer.setPadding(dp(8), dp(14), dp(8), 0);
        content.addView(footer);
    }

    private void refreshStatus() {
        JSONObject status = SamsungHealthRuntime.status(this);
        String state = status.optString("state", "unavailable");
        statusView.setText(switch (state) {
            case "connected" -> "Samsung Health conectado";
            case "permission_required" -> "Permissão necessária";
            case "samsung_health_missing" -> "Samsung Health não encontrado";
            case "sdk_missing" -> "SDK Samsung ainda não incluído nesta build";
            default -> "Samsung Health indisponível";
        });

        connectButton.setEnabled(SamsungHealthRuntime.sdkBundled()
                && SamsungHealthRuntime.samsungHealthInstalled(this));
        refreshButton.setEnabled("connected".equals(state));

        String cached = LifeSummaryStore.read(this);
        if (cached != null && !cached.isBlank()) {
            try {
                renderSummary(new JSONObject(cached));
            } catch (Exception ignored) {}
        }
    }

    private void requestPermissionsAndRefresh() {
        connectButton.setEnabled(false);
        statusView.setText("Abrindo permissões do Samsung Health…");
        new Thread(() -> {
            try {
                boolean granted = SamsungHealthRuntime.requestPermissions(this);
                runOnUiThread(() -> {
                    connectButton.setEnabled(true);
                    if (granted) {
                        statusView.setText("Samsung Health conectado");
                        refreshButton.setEnabled(true);
                        refreshSummary();
                    } else {
                        statusView.setText("Permissões não concedidas");
                    }
                });
            } catch (Throwable error) {
                runOnUiThread(() -> {
                    connectButton.setEnabled(true);
                    statusView.setText("Não foi possível conectar: " + friendlyError(error));
                });
            }
        }, "crewlife-samsung-permission").start();
    }

    private void refreshSummary() {
        refreshButton.setEnabled(false);
        statusView.setText("Atualizando resumo…");
        new Thread(() -> {
            try {
                JSONObject summary = SamsungHealthRuntime.readSummary(this);
                LifeSummaryStore.save(this, summary);
                runOnUiThread(() -> {
                    renderSummary(summary);
                    statusView.setText("Samsung Health conectado · atualizado agora");
                    refreshButton.setEnabled(true);
                });
            } catch (Throwable error) {
                runOnUiThread(() -> {
                    statusView.setText("Atualização indisponível: " + friendlyError(error));
                    refreshButton.setEnabled(true);
                });
            }
        }, "crewlife-samsung-read").start();
    }

    private void renderSummary(JSONObject json) {
        StringBuilder text = new StringBuilder();
        int energy = json.optInt("energyScore", 0);
        if (energy > 0) text.append("Energia ").append(energy).append("/100\n");
        int sleep = json.optInt("sleepMinutes", 0);
        if (sleep > 0) text.append("Sono ").append(sleep / 60).append("h")
                .append(String.format("%02d", sleep % 60)).append("\n");
        int sleepScore = json.optInt("sleepScore", 0);
        if (sleepScore > 0) text.append("Sleep score ").append(sleepScore).append("\n");
        long steps = json.optLong("steps", 0);
        if (steps > 0) text.append("Passos ").append(String.format("%,d", steps)).append("\n");
        long activity = json.optLong("activeMinutes", 0);
        if (activity > 0) text.append("Atividade ").append(activity).append(" min\n");
        long calories = json.optLong("caloriesBurned", 0);
        if (calories > 0) text.append("Calorias ").append(calories).append(" kcal\n");
        double distance = json.optDouble("distanceMeters", 0);
        if (distance > 0) text.append("Distância ").append(String.format("%.2f km", distance / 1000d));
        summaryView.setText(text.length() == 0 ? "Sem dados disponíveis para hoje." : text.toString().trim());
    }

    private static String friendlyError(Throwable error) {
        Throwable cursor = error;
        while (cursor.getCause() != null) cursor = cursor.getCause();
        String name = cursor.getClass().getSimpleName();
        if (name.contains("Authorization")) return "app ainda não autorizado pela Samsung";
        if (name.contains("ResolvablePlatform")) return "Samsung Health precisa de atenção";
        return name == null || name.isBlank() ? "erro desconhecido" : name;
    }

    private LinearLayout card(int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(16), dp(18), dp(16));
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{Color.argb(60, Color.red(accent), Color.green(accent), Color.blue(accent)),
                        Color.rgb(13, 34, 55)}
        );
        background.setCornerRadius(dp(24));
        background.setStroke(dp(1), Color.argb(110, Color.red(accent), Color.green(accent), Color.blue(accent)));
        card.setBackground(background);
        return card;
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        p.setMargins(0, dp(7), 0, dp(7));
        return p;
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        p.setMargins(0, dp(5), 0, dp(5));
        return p;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        view.setIncludeFontPadding(false);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
