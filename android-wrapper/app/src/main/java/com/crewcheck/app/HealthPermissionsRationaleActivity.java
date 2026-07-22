package com.crewcheck.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Política exibida a partir da tela de permissões do Health Connect. */
public class HealthPermissionsRationaleActivity extends Activity {
    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(0, 1.18f);
        view.setPadding(0, 0, 0, dp(14));
        return view;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("CrewCheck Life · Privacidade");
        getWindow().setStatusBarColor(Color.parseColor("#071D33"));

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.parseColor("#071D33"));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.START);
        content.setPadding(dp(24), dp(28), dp(24), dp(32));

        content.addView(text("CrewCheck Life", 30, Color.WHITE));
        content.addView(text("Por que o CrewCheck pede estes dados", 20, Color.parseColor("#67E8F9")));
        content.addView(text("Com sua autorização, o CrewCheck lê resumos de sono, passos, distância, atividade física e tendência de frequência cardíaca em repouso para ajudar a organizar sua rotina ao redor da escala.", 16, Color.parseColor("#D5E4F3")));
        content.addView(text("Uso local e limitado", 20, Color.WHITE));
        content.addView(text("A leitura acontece no aparelho. O CrewCheck recebe somente um resumo para mostrar a você; não copia a série bruta para o servidor, não usa os dados para publicidade, ranking ou comparação entre tripulantes.", 16, Color.parseColor("#D5E4F3")));
        content.addView(text("O que não é solicitado", 20, Color.WHITE));
        content.addView(text("Pressão arterial, glicose, peso, medicamentos, exames, diagnósticos, fertilidade e prontuários não fazem parte do CrewCheck Life.", 16, Color.parseColor("#D5E4F3")));
        content.addView(text("Não é ferramenta médica", 20, Color.WHITE));
        content.addView(text("O CrewCheck Life não diagnostica, não determina aptidão e não substitui avaliação profissional ou os canais oficiais de reporte de fadiga.", 16, Color.parseColor("#D5E4F3")));
        content.addView(text("Você pode revogar as permissões no Health Connect e apagar os resumos locais a qualquer momento dentro do CrewCheck Life.", 16, Color.parseColor("#86EFAC")));

        Button close = new Button(this);
        close.setText("Entendi e voltar");
        close.setTextColor(Color.parseColor("#031728"));
        close.setBackgroundColor(Color.parseColor("#67E8F9"));
        close.setOnClickListener(v -> finish());
        content.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));

        scroll.addView(content, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }
}
