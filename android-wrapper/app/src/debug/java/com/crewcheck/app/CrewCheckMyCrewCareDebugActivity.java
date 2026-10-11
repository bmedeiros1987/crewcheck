package com.crewcheck.app;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewBuilder;
import java.util.UUID;
import static com.crewcheck.app.CrewCheckMyCrewCarePortalV3.*;

/** Debug source-set only. Does not read intent extras, credentials or the production app's state. */
@WebViewBuilder.Experimental
public final class CrewCheckMyCrewCareDebugActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final String account = "debug_" + UUID.randomUUID();
    private CrewCheckMyCrewCareRuntimeV3 runtime;
    private EditText employee, username;
    private CheckBox consent;
    private Button start;
    private TextView status;
    private boolean foreground, running, cleaning, destroyed;
    private long token;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        TextView explanation = new TextView(this);
        explanation.setText("Teste MyCrewCare exclusivo de debug. Sem login, credenciais ou importação operacional. "
            + "Este app isolado não recebe a sessão do CrewCheck de produção. Sem sessão válida, a verificação falha. "
            + "O teste pode consultar as páginas MyCrewCare; não comprova datas, fusos ou uso operacional.");
        layout.addView(explanation);
        employee = field(layout, "Matrícula esperada (somente números)");
        username = field(layout, "Identidade esperada no perfil (não é senha)");
        consent = new CheckBox(this);
        consent.setText("Autorizo esta tentativa de teste e a consulta às páginas MyCrewCare. Não haverá login automático.");
        consent.setSaveEnabled(false);
        layout.addView(consent);
        start = new Button(this); start.setText("Verificar contrato observado"); layout.addView(start);
        Button cancel = new Button(this); cancel.setText("Cancelar e limpar perfil de teste"); layout.addView(cancel);
        status = new TextView(this); status.setText("Não iniciado. Nenhuma página consultada."); layout.addView(status);
        setContentView(layout);
        start.setOnClickListener(view -> start());
        cancel.setOnClickListener(view -> cancel());
    }
    private EditText field(LinearLayout layout, String hint) {
        EditText field = new EditText(this);
        field.setHint(hint); field.setSaveEnabled(false);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        layout.addView(field); return field;
    }
    @Override protected void onStart() { super.onStart(); foreground = true; }
    private void start() {
        if (!foreground || destroyed || running || cleaning) return;
        if (!consent.isChecked()) { status.setText("Confirme a autorização antes de iniciar."); return; }
        consent.setChecked(false); // Every attempt requires a fresh explicit confirmation.
        final ObservedScope scope;
        try {
            scope = new ObservedScope(account, UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                employee.getText().toString().trim(), username.getText().toString().trim(), 0);
        } catch (IllegalArgumentException error) { status.setText("Informe a matrícula e a identidade esperadas."); return; }
        final long attempt = ++token;
        running = true; start.setEnabled(false);
        status.setText("Verificando. Nenhum dado será importado ou exibido.");
        try {
            if (runtime == null) runtime = new CrewCheckMyCrewCareRuntimeV3(this, null, null, () -> false);
            var source = CrewCheckMyCrewCareObservedWebViewSource.prepare(this, new CrewCheckMyCrewCareProfile(), scope);
            ObservedDeadline deadline = (milliseconds, timeout) -> {
                main.postDelayed(timeout, milliseconds);
                return () -> main.removeCallbacks(timeout);
            };
            boolean accepted = runtime.observeMyCrewCareV3ForReview(scope, source, deadline, (result, error) -> {
                if (attempt != token || !running) return;
                boolean valid = result != null && result.schemaVersion == 3 && !result.operationalImportAllowed
                    && account.equals(result.accountId) && scope.sessionId.equals(result.sessionId)
                    && scope.requestId.equals(result.requestId) && result.generation > 0;
                String message = valid
                    ? "Contrato observado válido (" + result.observations.size() + " registros). Datas/fusos e uso operacional não validados. Nada importado."
                    : "Não validado: sessão, identidade, navegação ou conteúdo não comprovados. Nada importado.";
                finish(attempt, message);
            });
            if (!accepted && running) { source.cancel(scope); finish(attempt, "Tentativa rejeitada. Nada importado."); }
        } catch (Exception error) {
            if (running) finish(attempt, "Teste indisponível ou não validado. Sem fallback. Nada importado.");
        }
    }
    private void cancel() {
        if (!running) return;
        // Cancel can synchronously deliver completion; mark ownership first.
        long attempt = token; running = false;
        runtime.cancelMyCrewCareObservationV3ForReview();
        cleanup(attempt, "Cancelado. Nada importado.");
    }
    private void finish(long attempt, String message) {
        if (attempt != token || !running) return;
        running = false;
        cleanup(attempt, message);
    }
    private void cleanup(long attempt, String message) {
        cleaning = true;
        String operation = UUID.randomUUID().toString();
        try {
            if (runtime == null || !runtime.startMyCrewCareCleanupV3(account, true, operation)) {
                cleanupFailed(); return;
            }
        } catch (RuntimeException error) { cleanupFailed(); return; }
        checkCleanup(attempt, operation, message, 0);
    }
    private void checkCleanup(long attempt, String operation, String message, int polls) {
        if (attempt != token) return;
        String outcome = runtime.myCrewCareCleanupResultV3(account, operation);
        if (outcome.equals("pending") && polls < 300) {
            if (!destroyed) status.setText("Limpando o perfil de teste; resultado ainda não concluído.");
            main.postDelayed(() -> checkCleanup(attempt, operation, message, polls + 1), 100);
            return;
        }
        if (!outcome.equals("ok")) { cleanupFailed(); return; }
        cleaning = false;
        if (!destroyed) { status.setText(message + " Perfil de teste limpo."); start.setEnabled(true); }
    }
    private void cleanupFailed() {
        // Keep retry disabled: never announce cleanup success or reuse an unverified profile.
        if (!destroyed) status.setText("Limpeza do perfil não confirmada. Teste bloqueado; nada importado.");
    }
    @Override protected void onStop() { foreground = false; cancel(); super.onStop(); }
    @Override protected void onDestroy() {
        foreground = false; cancel(); destroyed = true;
        if (runtime != null) runtime.destroy();
        super.onDestroy();
    }
}
