package com.crewcheck.auto;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.text.InputFilter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

/** Phone-only setup. No login or editing form is rendered in the car. */
public final class DriveSetupActivity extends Activity {
    private DriveRepository repository;
    private TextView status, saved;
    private final Runnable render = this::renderStatus;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        repository = DriveRepository.get(this);
        ScrollView scroll = new ScrollView(this);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        column.setPadding(pad, pad, pad, pad);
        scroll.addView(column);
        setContentView(scroll);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.crewcheck_icon_site);
        logo.setContentDescription("CrewCheck");
        int size = (int) (72 * getResources().getDisplayMetrics().density);
        column.addView(logo, new LinearLayout.LayoutParams(size, size));
        text(column, "CrewCheck Drive Lab", 26);
        text(column, "Configure somente com o carro estacionado. Este aplicativo é um laboratório, não a versão da Play.", 16);
        Switch sync = new Switch(this);
        sync.setText("Receber destinos do CrewCheck Phone Lab");
        sync.setChecked(repository.enabled());
        column.addView(sync);
        text(column, "Opcional: usa apenas a projeção local da escala. Não recebe login, CPF, dados de saúde ou a escala completa. Os dois APKs devem vir do mesmo build. O CrewCheck da Play não possui esta ponte.", 15);
        sync.setOnCheckedChangeListener((button, checked) -> repository.setEnabled(checked));
        status = text(column, "", 16);
        Button refresh = new Button(this);
        refresh.setText("Sincronizar agora");
        refresh.setOnClickListener(v -> repository.refresh());
        column.addView(refresh);
        text(column, "Destinos salvos", 21);
        text(column, "Cadastre até quatro aeroportos ou hotéis. Eles ficam apenas neste aplicativo e também funcionam sem vincular a escala.", 15);
        EditText title = new EditText(this);
        title.setHint("Nome: aeroporto ou hotel");
        title.setSingleLine(true);
        title.setFilters(new InputFilter[]{new InputFilter.LengthFilter(60)});
        column.addView(title);
        EditText address = new EditText(this);
        address.setHint("Endereço completo ou nome + cidade");
        address.setSingleLine(true);
        address.setFilters(new InputFilter[]{new InputFilter.LengthFilter(180)});
        column.addView(address);
        Button add = new Button(this);
        add.setText("Salvar destino");
        add.setOnClickListener(v -> {
            try {
                repository.addManual(title.getText().toString(), address.getText().toString());
                title.setText(""); address.setText("");
            } catch (Exception error) {
                Toast.makeText(this, error instanceof IllegalArgumentException ? error.getMessage()
                        : "Não foi possível salvar o destino.", Toast.LENGTH_LONG).show();
            }
        });
        column.addView(add);
        saved = text(column, "", 16);
        Button clear = new Button(this);
        clear.setText("Apagar destinos salvos");
        clear.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Apagar os destinos deste laboratório?")
                .setMessage("Isso não altera sua escala nem os dados do CrewCheck.")
                .setNegativeButton("Cancelar", null).setPositiveButton("Apagar", (dialog, which) -> repository.clearManual()).show());
        column.addView(clear);
        text(column, "No Android Auto: abra CrewCheck Drive Lab, escolha o destino e toque em Buscar rota. O navegador da central resolve o endereço e conduz a viagem.", 15);
        renderStatus();
    }
    private TextView text(LinearLayout column, String value, int size) {
        TextView view = new TextView(this);
        view.setText(value); view.setTextSize(size); view.setPadding(0, 12, 0, 12);
        column.addView(view); return view;
    }
    private void renderStatus() {
        if (status == null || saved == null) return;
        status.setText(repository.status());
        StringBuilder text = new StringBuilder();
        for (DriveSnapshot.Destination destination : repository.manual()) {
            text.append(destination.title).append("\n").append(destination.query).append("\n\n");
        }
        saved.setText(text.length() == 0 ? "Nenhum destino salvo." : text.toString().trim());
    }
    @Override public void onResume() { super.onResume(); repository.start(render); }
    @Override public void onPause() { repository.stop(render); super.onPause(); }
}
