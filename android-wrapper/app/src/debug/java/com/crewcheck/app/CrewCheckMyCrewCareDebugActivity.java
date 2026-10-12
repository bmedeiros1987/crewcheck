package com.crewcheck.app;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.webkit.*;
import android.net.http.SslError;
import android.graphics.Bitmap;
import java.net.URI;
import java.io.ByteArrayInputStream;
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
    private Button prepare, start;
    private LinearLayout layout;
    private volatile WebView loginView;
    private static final class Login { final long token; final WebView page; volatile boolean revoked; Login(long token, WebView page) { this.token=token; this.page=page; } }
    private volatile Login login;
    private ObservedScope scope;
    private final CrewCheckMyCrewCareProfile profiles = new CrewCheckMyCrewCareProfile();
    private boolean preparing;
    private static final String ENTRY = "https://api2.apicrewcare.com/LATAM/mytravel.aspx";
    private TextView explanation, status;
    private boolean foreground, cleaning, destroyed, stopFailed;
    private volatile boolean running;
    private volatile long token;
    // Separate presentation authority: revocation must not abandon pending cleanup.
    private long previewEpoch;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        explanation = new TextView(this);
        explanation.setText("Teste MyCrewCare exclusivo de debug. Login manual somente na página oficial visível. "
            + "Não captura formulário, senha ou cookies nem recebe a sessão do CrewCheck de produção. "
            + "O teste pode consultar as páginas MyCrewCare; não comprova datas, fusos ou uso operacional.");
        layout.addView(explanation);
        employee = field(layout, "Matrícula esperada (somente números)");
        username = field(layout, "Identidade esperada no perfil (não é senha)");
        consent = new CheckBox(this);
        consent.setText("Autorizo esta tentativa de teste e a consulta às páginas MyCrewCare. Login somente por mim na página visível, sem login automático.");
        consent.setSaveEnabled(false);
        layout.addView(consent);
        prepare = new Button(this); prepare.setText("Preparar sessão na página visível"); layout.addView(prepare);
        start = new Button(this); start.setEnabled(false); start.setText("Verificar contrato observado"); layout.addView(start);
        Button cancel = new Button(this); cancel.setText("Cancelar e limpar perfil de teste"); layout.addView(cancel);
        status = new TextView(this); status.setText("Não iniciado. Nenhuma página consultada."); layout.addView(status);
        setContentView(layout);
        prepare.setOnClickListener(view -> prepareSession());
        start.setOnClickListener(view -> start());
        cancel.setOnClickListener(view -> cancel());
    }
    private void attemptControls(boolean active) {
        int visibility = active ? View.GONE : View.VISIBLE;
        explanation.setVisibility(visibility); employee.setVisibility(visibility); username.setVisibility(visibility);
        consent.setVisibility(visibility); prepare.setVisibility(visibility);
    }
    private EditText field(LinearLayout layout, String hint) {
        EditText field = new EditText(this);
        field.setHint(hint); field.setSaveEnabled(false);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        layout.addView(field); return field;
    }
    @Override protected void onStart() { super.onStart(); foreground = true; }
    private void prepareSession() {
        if (!foreground || destroyed || running || cleaning) return;
        if (!consent.isChecked()) { status.setText("Confirme a autorização antes de iniciar."); return; }
        consent.setChecked(false);
        try {
            scope = new ObservedScope(account, UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                employee.getText().toString().trim(), username.getText().toString().trim(), 0);
        } catch (IllegalArgumentException error) { status.setText("Informe a matrícula e a identidade esperadas."); return; }
        final long attempt = ++token;
        ++previewEpoch;
        running = true; preparing = true; attemptControls(true); prepare.setEnabled(false); start.setEnabled(false);
        status.setText("Prepare a sessão somente na página visível. Ao retornar a My Travel, toque em verificar. A URL não prova autenticação.");
        try {
            if (runtime == null) runtime = new CrewCheckMyCrewCareRuntimeV3(this, null, null, () -> false);
            loginView = profiles.create(this, account);
            final WebView page = loginView;
            login = new Login(attempt, page);
            page.setSaveEnabled(false);
            page.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            WebSettings settings = page.getSettings();
            settings.setSaveFormData(false); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
            settings.setJavaScriptEnabled(true); // Official page executes its own login UI; no native injection.
            page.setWebChromeClient(new WebChromeClient() { @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); } });
            page.setDownloadListener((url, agent, disposition, type, length) -> loginFailed(attempt, page));
            page.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                    if (!loginCurrent(attempt, page) || v != page) return true;
                    boolean allowed = r.isForMainFrame() && loginTarget(r.getUrl().toString())
                        && (r.getMethod().equals("GET") || r.getMethod().equals("POST") && loginPage(r.getUrl().toString()));
                    if (!allowed) loginFailed(attempt, page);
                    return !allowed;
                }
                @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                    if (!loginCurrent(attempt, page) || v != page) return true;
                    if (loginTarget(url)) return false;
                    loginFailed(attempt, page); return true;
                }
                @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                    boolean allowed = loginCurrent(attempt, page) && v == page &&
                        (r.isForMainFrame() ? loginTarget(r.getUrl().toString()) &&
                            (r.getMethod().equals("GET") || r.getMethod().equals("POST") && loginPage(r.getUrl().toString()))
                            : portalOrigin(r.getUrl().toString()) && r.getMethod().equals("GET"));
                    if (allowed) return null;
                    loginFailed(attempt, page);
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
                @Override public void onPageStarted(WebView v, String url, Bitmap icon) {
                    if (v != page || !loginCurrent(attempt, page)) return;
                    start.setEnabled(false);
                    if (!loginTarget(url)) loginFailed(attempt, page);
                }
                @Override public void onPageFinished(WebView v, String url) {
                    if (v != page || !loginCurrent(attempt, page)) return;
                    if (!loginTarget(url) || !loginTarget(page.getUrl())) { loginFailed(attempt, page); return; }
                    start.setEnabled(ENTRY.equals(url) && ENTRY.equals(page.getUrl()));
                }
                @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError error) { if (v == page && r.isForMainFrame()) loginFailed(attempt, page); }
                @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse response) { if (v == page && r.isForMainFrame()) loginFailed(attempt, page); }
                @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) { handler.cancel(); if (v == page) loginFailed(attempt, page); }
                @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) { if (v == page) loginFailed(attempt, page); return true; }
            });
            layout.addView(page, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
            page.loadUrl(ENTRY);
        } catch (RuntimeException error) { finish(attempt, "Preparação indisponível. Sem fallback. Nada importado."); }
    }
    private static boolean portalOrigin(String url) {
        try { URI u = URI.create(url); return "https".equals(u.getScheme()) && "api2.apicrewcare.com".equals(u.getHost())
            && u.getUserInfo() == null && u.getFragment() == null && (u.getPort() == -1 || u.getPort() == 443); }
        catch (RuntimeException error) { return false; }
    }
    private static boolean loginPage(String url) {
        try { URI u = URI.create(url); return portalOrigin(url) && "/Main/Login.aspx".equals(u.getRawPath()) &&
            ("ReturnUrl=%2fLATAM%2fmytravel.aspx".equals(u.getRawQuery()) || "ReturnUrl=%2FLATAM%2Fmytravel.aspx".equals(u.getRawQuery())); }
        catch (RuntimeException error) { return false; }
    }
    private static boolean loginTarget(String url) { return ENTRY.equals(url) || loginPage(url); }
    private boolean loginCurrent(long attempt, WebView page) {
        Login current = login;
        return current != null && current.token == attempt && current.page == page && !current.revoked && attempt == token && running;
    }
    private void loginFailed(long attempt, WebView page) {
        Login current = login;
        if (current == null) return;
        synchronized (current) {
            if (login != current || current.token != attempt || current.page != page || current.revoked) return;
            // Shares the handoff commit monitor; revoke only this exact preparation.
            current.revoked = true;
        }
        main.post(() -> { if (login == current && attempt == token && running) finish(attempt,
            "Preparação bloqueada: destino/SSO fora do escopo ou página não comprovada. Nada importado."); });
    }
    private boolean stopLogin() {
        WebView old = loginView; login = null; loginView = null; preparing = false; start.setEnabled(false);
        if (old != null) {
            try { layout.removeView(old); old.stopLoading(); } catch (RuntimeException error) { stopFailed = true; }
            try { old.destroy(); } catch (RuntimeException error) { stopFailed = true; }
        }
        return !stopFailed;
    }
    private boolean handoff(Login expected) {
        // Keep this preparation attributable through teardown. No monitor while calling WebView/UI.
        WebView old = expected.page;
        start.setEnabled(false);
        try { layout.removeView(old); old.stopLoading(); } catch (RuntimeException error) { stopFailed = true; }
        try { old.destroy(); } catch (RuntimeException error) { stopFailed = true; }
        synchronized (expected) {
            boolean accepted = login == expected && expected.token == token && running && !expected.revoked && !stopFailed;
            if (login == expected) { login = null; loginView = null; preparing = false; }
            // Native failures before this commit reject; callbacks after it belong to the old view.
            return accepted;
        }
    }
    private void start() {
        if (!foreground || destroyed || !running || !preparing || cleaning || !start.isEnabled() || !loginCurrent(token, loginView)) return;
        final long attempt = token;
        final Login expected = login;
        final ObservedScope captured = scope;
        status.setText("Verificando identidade e contrato. Leitura somente das reservas desta identidade; sem importação.");
        try {
            if (!handoff(expected)) { finish(attempt, "Preparação ou encerramento não confirmado. Nada importado."); return; }
            var source = CrewCheckMyCrewCareObservedWebViewSource.prepare(this, profiles, captured);
            ObservedDeadline deadline = (milliseconds, timeout) -> {
                main.postDelayed(timeout, milliseconds);
                return () -> main.removeCallbacks(timeout);
            };
            boolean accepted = runtime.observeMyCrewCareV3ForReview(captured, source, deadline, (result, error) -> {
                if (attempt != token || !running) return;
                boolean valid = result != null && result.schemaVersion == 3 && !result.operationalImportAllowed
                    && account.equals(result.accountId) && captured.sessionId.equals(result.sessionId)
                    && captured.requestId.equals(result.requestId) && result.generation > 0;
                String message = valid
                    ? reservationPreview(result)
                    : "Não validado: sessão, identidade, navegação ou conteúdo não comprovados. Nada importado.";
                finish(attempt, message);
            });
            if (!accepted && running) { source.cancel(captured); finish(attempt, "Tentativa rejeitada. Nada importado."); }
        } catch (Exception error) {
            if (running) finish(attempt, "Teste indisponível ou não validado. Sem fallback. Nada importado.");
        }
    }
    private String reservationPreview(ObservedResult result) {
        StringBuilder text = new StringBuilder("Contrato observado válido. Leitura somente; datas/fusos e uso operacional não validados. Nada importado.");
        // Only the owner's validated observations reach here; no HTML, profile or login data.
        for (var row : result.observations) {
            text.append("\n\nReserva — ").append(row.get("airport"));
            text.append("\nHotel: ").append(row.get("hotelName"));
            text.append("\nEntrada (horário local informado): ").append(row.get("checkInWallDateTime"));
            text.append("\nSaída (horário local informado): ").append(row.get("checkOutWallDateTime"));
            text.append("\nPickup para hotel: ").append(row.get("toHotelProvider")).append(" — ").append(row.get("toHotelPickupWallTime"));
            text.append("\nPickup para aeroporto: ").append(row.get("toAirportProvider")).append(" — ").append(row.get("toAirportPickupWallTime"));
        }
        if (result.observations.isEmpty()) text.append("\nNenhuma reserva observada nesta consulta.");
        return text.toString();
    }
    private void cancel() {
        ++previewEpoch; // Includes completed reads whose profile cleanup is still pending.
        if (!running) {
            if (!destroyed) status.setText(cleaning ? "Resultado revogado; limpeza do perfil ainda pendente." : "Cancelado. Visualização apagada; nada importado.");
            return;
        }
        // Cancel can synchronously deliver completion; mark ownership first.
        long attempt = token; running = false; stopLogin();
        try { if (runtime != null) runtime.cancelMyCrewCareObservationV3ForReview(); }
        catch (RuntimeException error) { stopFailed = true; }
        cleanup(attempt, "Cancelado. Nada importado.");
    }
    private void finish(long attempt, String message) {
        if (attempt != token || !running) return;
        running = false; stopLogin();
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
        checkCleanup(attempt, previewEpoch, operation, message, 0);
    }
    private void checkCleanup(long attempt, long publicationEpoch, String operation, String message, int polls) {
        if (attempt != token) return;
        String outcome = runtime.myCrewCareCleanupResultV3(account, operation);
        if (outcome.equals("pending") && polls < 300) {
            if (!destroyed) status.setText("Limpando o perfil de teste; resultado ainda não concluído.");
            main.postDelayed(() -> checkCleanup(attempt, publicationEpoch, operation, message, polls + 1), 100);
            return;
        }
        if (!outcome.equals("ok") || stopFailed) { cleanupFailed(); return; }
        cleaning = false;
        if (!destroyed) {
            // Commit only while the exact attempt still owns visible presentation.
            // Never increment token to revoke preview: cleanup/error polling must settle.
            boolean mayPublish = attempt == token && publicationEpoch == previewEpoch && foreground;
            status.setText((mayPublish ? message : "Resultado revogado. Nada importado.") + " Perfil de teste limpo.");
            attemptControls(false); prepare.setEnabled(true);
        }
    }
    private void cleanupFailed() {
        // Keep retry disabled: never announce cleanup success or reuse an unverified profile.
        if (!destroyed) status.setText("Limpeza do perfil não confirmada ou encerramento incompleto. Teste bloqueado; nada importado.");
    }
    @Override protected void onStop() { foreground = false; cancel(); super.onStop(); }
    @Override protected void onDestroy() {
        foreground = false; cancel(); destroyed = true;
        if (runtime != null) runtime.destroy();
        super.onDestroy();
    }
}
