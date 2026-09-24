package com.crewcheck.life;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
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
        connectButton.setEnabled(false);
        connectButton.setOnClickListener(v -> requestPermissionsAndRefresh());
        content.addView(connectButton, buttonParams());

        refreshButton = new Button(this);
        refreshButton.setText("Atualizar agora");
        refreshButton.setEnabled(false);
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
        statusView.setText("Verificando Samsung Health…");
        connectButton.setEnabled(false);
        refreshButton.setEnabled(false);

        new Thread(() -> {
            JSONObject status = SamsungHealthRuntime.status(this);
            String cached = LifeSummaryStore.read(this);
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                applyStatus(status);
                if (cached != null && !cached.isBlank()) {
                    try {
                        renderSummary(new JSONObject(cached));
                    } catch (Exception ignored) {
                    }
                }
            });
        }, "crewlife-samsung-status").start();
    }

    private void applyStatus(JSONObject status) {
        String state = status.optString("state", "unavailable");
        statusView.setText(switch (state) {
            case "connected" -> "Samsung Health conectado";
            case "permission_required" -> "Permissão necessária";
            case "samsung_health_missing" -> "Samsung Health não está instalado";
            case "samsung_health_update_required" -> "Samsung Health precisa ser atualizado";
            case "samsung_health_disabled" -> "Samsung Health está desativado";
            case "samsung_health_setup_required" -> "Conclua a configuração do Samsung Health";
            case "authorization_required" -> "Esta build ainda não está autorizada pela Samsung";
            case "samsung_health_timeout" -> "Samsung Health demorou para responder";
            case "sdk_missing" -> "SDK Samsung ainda não incluído nesta build";
            default -> "Samsung Health indisponível";
        });

        boolean bundled = status.optBoolean("sdkBundled", false);
        boolean connected = "connected".equals(state);
        connectButton.setEnabled(bundled && !connected);
        refreshButton.setEnabled(connected);

        connectButton.setText(switch (state) {
            case "samsung_health_missing" -> "Instalar Samsung Health";
            case "samsung_health_update_required" -> "Atualizar Samsung Health";
            case "samsung_health_disabled" -> "Ativar Samsung Health";
            case "samsung_health_setup_required" -> "Concluir configuração";
            case "authorization_required", "samsung_health_timeout" -> "Tentar novamente";
            case "connected" -> "Samsung Health conectado";
            default -> "Conectar Samsung Health";
        });
    }

    private void requestPermissionsAndRefresh() {
        connectButton.setEnabled(false);
        statusView.setText("Abrindo permissões do Samsung Health…");

        new Thread(() -> {
            try {
                boolean granted = SamsungHealthRuntime.requestPermissions(this);
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    if (granted) {
                        statusView.setText("Samsung Health conectado");
                        refreshButton.setEnabled(true);
                        refreshSummary();
                    } else {
                        statusView.setText("Permissões não concedidas");
                        connectButton.setEnabled(true);
                    }
                });
            } catch (Throwable error) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    if (SamsungHealthRuntime.resolveIfPossible(error, this)) {
                        statusView.setText("Abrindo Samsung Health para corrigir a conexão…");
                    } else {
                        statusView.setText(
                                "Não foi possível conectar: "
                                        + SamsungHealthRuntime.friendlyError(error)
                        );
                    }
                    connectButton.setEnabled(true);
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
                    if (isFinishing() || isDestroyed()) return;
                    renderSummary(summary);
                    statusView.setText("Samsung Health conectado · atualizado agora");
                    refreshButton.setEnabled(true);
                });
            } catch (Throwable error) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    if (SamsungHealthRuntime.resolveIfPossible(error, this)) {
                        statusView.setText("Abrindo Samsung Health para corrigir a conexão…");
                    } else {
                        statusView.setText(
                                "Atualização indisponível: "
                                        + SamsungHealthRuntime.friendlyError(error)
                        );
                    }
                    refreshButton.setEnabled(true);
                });
            }
        }, "crewlife-samsung-read").start();
    }

    private void renderSummary(JSONObject json) {
        StringBuilder value = new StringBuilder();

        int energy = json.optInt("energyScore", 0);
        if (energy > 0) {
            value.append("Energia ").append(energy).append("/100\n");
        }

        int sleep = json.optInt("sleepMinutes", 0);
        if (sleep > 0) {
            value.append("Sono ")
                    .append(sleep / 60)
                    .append("h")
                    .append(String.format("%02d", sleep % 60))
                    .append("\n");
        }

        int sleepScore = json.optInt("sleepScore", 0);
        if (sleepScore > 0) {
            value.append("Pontuação do sono ").append(sleepScore).append("\n");
        }

        long steps = json.optLong("steps", 0);
        if (steps > 0) {
            value.append("Passos ").append(String.format("%,d", steps)).append("\n");
        }

        long activity = json.optLong("activeMinutes", 0);
        if (activity > 0) {
            value.append("Atividade ").append(activity).append(" min\n");
        }

        long calories = json.optLong("caloriesBurned", 0);
        if (calories > 0) {
            value.append("Calorias ativas ").append(calories).append(" kcal\n");
        }

        double distance = json.optDouble("distanceMeters", 0);
        if (distance > 0) {
            value.append("Distância ")
                    .append(String.format("%.2f km", distance / 1000d));
        }

        summaryView.setText(
                value.length() == 0
                        ? "Sem dados disponíveis para hoje."
                        : value.toString().trim()
        );
    }

    private LinearLayout card(int accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(16), dp(18), dp(16));

        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{
                        Color.argb(
                                60,
                                Color.red(accent),
                                Color.green(accent),
                                Color.blue(accent)
                        ),
                        Color.rgb(13, 34, 55)
                }
        );
        background.setCornerRadius(dp(24));
        background.setStroke(
                dp(1),
                Color.argb(
                        110,
                        Color.red(accent),
                        Color.green(accent),
                        Color.blue(accent)
                )
        );
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
