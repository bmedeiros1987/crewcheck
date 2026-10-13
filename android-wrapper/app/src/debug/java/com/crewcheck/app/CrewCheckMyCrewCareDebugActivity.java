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
import android.widget.ScrollView;
import androidx.webkit.WebViewBuilder;
import java.util.Locale;
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
    private enum PreparationFailure {
        ROUTE("MCC-ROUTE", "destino fora do escopo ou URL principal não comprovada"),
        ORIGIN("MCC-ORIGIN", "origem da navegação fora do escopo api2 comprovado"),
        METHOD("MCC-METHOD", "método da navegação principal não permitido"),
        RESOURCE_ORIGIN("MCC-RESOURCE-ORIGIN", "origem de um recurso da página fora do escopo api2 comprovado"),
        RESOURCE_METHOD("MCC-RESOURCE-METHOD", "recurso api2 recusado por método não permitido"),
        FRAME("MCC-FRAME", "navegação em frame não permitida"),
        NETWORK("MCC-NETWORK", "falha de carregamento da página"),
        HTTP("MCC-HTTP", "a página retornou erro HTTP"),
        TLS("MCC-TLS", "a conexão segura da página foi recusada"),
        RENDERER("MCC-RENDERER", "o processo da página foi encerrado"),
        DOWNLOAD("MCC-DOWNLOAD", "a página tentou iniciar download não permitido"),
        BACKGROUND("MCC-BACKGROUND", "a tela ficou em segundo plano por mais de 3 minutos durante o login");
        final String code, description;
        PreparationFailure(String code, String description) { this.code=code; this.description=description; }
    }
    private static final String ENTRY = "https://api2.apicrewcare.com/LATAM/mytravel.aspx";
    private TextView explanation, status, employeeLabel, usernameLabel;
    private boolean foreground, cleaning, destroyed, stopFailed;
    private boolean cleanupTerminalFailure;
    private volatile boolean running;
    private volatile long token;
    // Separate presentation authority: revocation must not abandon pending cleanup.
    private long previewEpoch;
    private PreparationFailure preparationFailure;
    private long preparationFailureAttempt;
    // Login visível pode ir a segundo plano (app de MFA/e-mail) sem perder a tentativa, por tempo limitado.
    static final long LOGIN_BACKGROUND_GRACE_MS = 180_000;
    private Runnable backgroundDeadline;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        explanation = new TextView(this);
        explanation.setText("Teste MyCrewCare exclusivo de debug.\n"
            + "1) Informe abaixo a matrícula e o usuário EXATAMENTE como aparecem em MyCrewCare › Perfil. "
            + "Não são o seu login: servem só para conferir, depois do login, que as reservas lidas são da sua conta.\n"
            + "2) Faça o login (e-mail, senha e eventual MFA) somente na página oficial que abrirá abaixo. "
            + "O teste não lê o formulário, a senha nem os cookies e não recebe a sessão do CrewCheck de produção.\n"
            + "3) Ao voltar a My Travel, toque em Verificar. Nada é importado; o perfil de teste é limpo ao final. "
            + "Datas, fusos e uso operacional não são validados.");
        layout.addView(explanation);
        employeeLabel = identityLabel("Sua matrícula no MyCrewCare (somente números, como no Perfil)");
        employee = field(layout, "Digite sua matrícula");
        usernameLabel = identityLabel("Seu usuário no MyCrewCare, exatamente como no Perfil (não é senha; pode ser diferente do e-mail de login)");
        username = field(layout, "Digite o usuário do Perfil, não o nome completo");
        consent = new CheckBox(this);
        consent.setText("Autorizo esta tentativa de teste e a consulta às páginas MyCrewCare. Login somente por mim na página visível, sem login automático.");
        consent.setSaveEnabled(false);
        layout.addView(consent);
        prepare = new Button(this); prepare.setText("Preparar sessão na página visível"); layout.addView(prepare);
        start = new Button(this); start.setEnabled(false); start.setText("Verificar contrato observado"); layout.addView(start);
        Button cancel = new Button(this); cancel.setText("Cancelar e limpar perfil de teste"); layout.addView(cancel);
        status = new TextView(this); status.setTextSize(16); status.setFocusable(true);
        status.setText("Não iniciado. Nenhuma página consultada.");
        ScrollView results = new ScrollView(this); results.setFillViewport(true);
        layout.addView(status); results.addView(layout);
        setContentView(results);
        prepare.setOnClickListener(view -> prepareSession());
        start.setOnClickListener(view -> start());
        cancel.setOnClickListener(view -> cancel());
    }
    private void attemptControls(boolean active) {
        int visibility = active ? View.GONE : View.VISIBLE;
        explanation.setVisibility(visibility); employee.setVisibility(visibility); username.setVisibility(visibility);
        employeeLabel.setVisibility(visibility); usernameLabel.setVisibility(visibility);
        consent.setVisibility(visibility); prepare.setVisibility(visibility);
    }
    private TextView identityLabel(String text) {
        TextView label = new TextView(this); label.setText(text); layout.addView(label); return label;
    }
    private EditText field(LinearLayout layout, String hint) {
        EditText field = new EditText(this);
        field.setHint(hint); field.setSaveEnabled(false);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        layout.addView(field); return field;
    }
    @Override protected void onStart() {
        super.onStart(); foreground = true;
        if (backgroundDeadline != null) { main.removeCallbacks(backgroundDeadline); backgroundDeadline = null; }
    }
    private void prepareSession() {
        if (!foreground || destroyed || running || cleaning) return;
        if (!consent.isChecked()) { status.setText("Confirme a autorização antes de iniciar."); return; }
        consent.setChecked(false);
        try {
            scope = new ObservedScope(account, UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                employee.getText().toString().trim(), username.getText().toString().trim(), 0);
        } catch (IllegalArgumentException error) { status.setText("Informe a matrícula (só números) e o usuário exatamente como aparecem no Perfil do MyCrewCare."); return; }
        final long attempt = ++token;
        preparationFailure = null; preparationFailureAttempt = attempt;
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
            page.setDownloadListener((url, agent, disposition, type, length) -> loginFailed(attempt, page, PreparationFailure.DOWNLOAD));
            page.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                    if (!loginCurrent(attempt, page) || v != page) return true;
                    boolean allowed = r.isForMainFrame() && loginTarget(r.getUrl().toString())
                        && (r.getMethod().equals("GET") || r.getMethod().equals("POST") && loginPage(r.getUrl().toString()));
                    if (!allowed) loginFailed(attempt, page, !r.isForMainFrame() ? PreparationFailure.FRAME : !loginTarget(r.getUrl().toString()) ? targetFailure(r.getUrl().toString()) : PreparationFailure.METHOD, r.getUrl().toString(), r.getMethod());
                    return !allowed;
                }
                @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                    if (!loginCurrent(attempt, page) || v != page) return true;
                    if (loginTarget(url)) return false;
                    loginFailed(attempt, page, targetFailure(url), url, "GET"); return true;
                }
                @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                    boolean allowed = loginCurrent(attempt, page) && v == page &&
                        (r.isForMainFrame() ? loginTarget(r.getUrl().toString()) &&
                            (r.getMethod().equals("GET") || r.getMethod().equals("POST") && loginPage(r.getUrl().toString()))
                            : portalOrigin(r.getUrl().toString()) && r.getMethod().equals("GET"));
                    if (allowed) return null;
                    loginFailed(attempt, page, r.isForMainFrame() ? !loginTarget(r.getUrl().toString()) ? targetFailure(r.getUrl().toString()) : PreparationFailure.METHOD : portalOrigin(r.getUrl().toString()) ? PreparationFailure.RESOURCE_METHOD : PreparationFailure.RESOURCE_ORIGIN, r.getUrl().toString(), r.getMethod());
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
                @Override public void onPageStarted(WebView v, String url, Bitmap icon) {
                    if (v != page || !loginCurrent(attempt, page)) return;
                    start.setEnabled(false);
                    if (!loginTarget(url)) loginFailed(attempt, page, targetFailure(url), url, "GET");
                }
                @Override public void onPageFinished(WebView v, String url) {
                    if (v != page || !loginCurrent(attempt, page)) return;
                    if (!loginTarget(url) || !loginTarget(page.getUrl())) { String bad = !loginTarget(url) ? url : page.getUrl(); loginFailed(attempt, page, targetFailure(bad), bad, "GET"); return; }
                    start.setEnabled(ENTRY.equals(url) && ENTRY.equals(page.getUrl()));
                }
                @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError error) { if (v == page && r.isForMainFrame()) loginFailed(attempt, page, PreparationFailure.NETWORK); }
                @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse response) { if (v == page && r.isForMainFrame()) loginFailed(attempt, page, PreparationFailure.HTTP); }
                @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) { handler.cancel(); if (v == page) loginFailed(attempt, page, PreparationFailure.TLS); }
                @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) { if (v == page) loginFailed(attempt, page, PreparationFailure.RENDERER); return true; }
            });
            layout.addView(page, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Math.round(360 * getResources().getDisplayMetrics().density), 0));
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
    private static PreparationFailure targetFailure(String url) {
        // Only a fixed classification is retained; URL/path/query never enter diagnostics.
        return portalOrigin(url) ? PreparationFailure.ROUTE : PreparationFailure.ORIGIN;
    }
    /** Domínio (host) apenas — nunca caminho, query, fragmento ou credencial embutida. */
    static String safeDomain(String url) {
        try {
            URI u = URI.create(url);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (!"https".equals(scheme) && !"http".equals(scheme))
                return "esquema " + (scheme.matches("[a-z][a-z0-9+.-]{0,15}") ? scheme : "desconhecido");
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            if (!host.matches("[a-z0-9.-]{1,253}")) return "inválido";
            return "http".equals(scheme) ? host + " (sem HTTPS)" : host;
        } catch (RuntimeException error) { return "inválido"; }
    }
    static String safeMethod(String method) { return "GET".equals(method) || "POST".equals(method) ? method : "outro"; }
    /** Detalhe permitido por categoria: domínio só para origem externa; método para recusas de método/rota. */
    static String failureDetail(PreparationFailure reason, String url, String method) {
        switch (reason) {
            case ORIGIN: case RESOURCE_ORIGIN: return "domínio " + safeDomain(url) + ", método " + safeMethod(method);
            case ROUTE: case METHOD: case RESOURCE_METHOD: return "método " + safeMethod(method);
            default: return "";
        }
    }
    private void loginFailed(long attempt, WebView page, PreparationFailure reason, String url, String method) {
        loginFailed(attempt, page, reason, failureDetail(reason, url, method));
    }
    private void loginFailed(long attempt, WebView page, PreparationFailure reason) { loginFailed(attempt, page, reason, ""); }
    private void loginFailed(long attempt, WebView page, PreparationFailure reason, String detail) {
        Login current = login;
        if (current == null) return;
        synchronized (current) {
            if (login != current || current.token != attempt || current.page != page || current.revoked) return;
            // Shares the handoff commit monitor; revoke only this exact preparation.
            current.revoked = true;
        }
        main.post(() -> { if (login == current && attempt == token && running) {
            preparationFailure = reason; preparationFailureAttempt = attempt;
            finish(attempt, "Preparação bloqueada [" + reason.code + "]: " + reason.description
                + (detail.isEmpty() ? "" : " (" + detail + ")") + ". Nada importado; nenhuma sessão ficou conectada. "
                + nextStep(reason) + " Matrícula e usuário foram mantidos; para tentar de novo, marque a autorização.");
        } });
    }
    static String nextStep(PreparationFailure reason) {
        switch (reason) {
            case ORIGIN: case RESOURCE_ORIGIN: case ROUTE: case METHOD: case RESOURCE_METHOD: case FRAME:
                return "Próximo passo: envie esta mensagem (código e domínio) ao responsável pelo teste; esse destino precisa ser revisado antes de ser liberado. Repetir agora levará ao mesmo ponto.";
            case NETWORK: return "Próximo passo: verifique a conexão e tente de novo.";
            case HTTP: case RENDERER: return "Próximo passo: tente de novo mais tarde.";
            case TLS: return "Próximo passo: não prossiga nesta rede (proxy/Wi-Fi público); tente em outra.";
            case BACKGROUND: return "Próximo passo: tente de novo e conclua senha/MFA em até 3 minutos fora da tela.";
            default: return "Próximo passo: envie esta mensagem ao responsável pelo teste.";
        }
    }
    private String diagnosticSuffix() {
        return preparationFailure != null && preparationFailureAttempt == token ? " [" + preparationFailure.code + "]" : "";
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
                finish(attempt, message, valid);
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
            String rawStatus = row.get("confirmationRaw");
            text.append("\nEstado recebido: ").append(rawStatus);
            if ("Cancelled".equalsIgnoreCase(rawStatus)) text.append("\nCANCELADA — hotel e pickup abaixo são dados do registro cancelado; não utilizar como reserva ativa.");
            else if ("Planned".equalsIgnoreCase(rawStatus)) text.append("\nPLANEJADA — não equivale a reserva confirmada.");
            else text.append("\nESTADO DESCONHECIDO — não tratar hotel ou pickup como confirmados.");
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
            if (!destroyed && !cleanupTerminalFailure) status.setText(cleaning ? "Resultado revogado; limpeza do perfil ainda pendente." + diagnosticSuffix() : "Cancelado. Visualização apagada; nada importado.");
            return;
        }
        // Cancel can synchronously deliver completion; mark ownership first.
        long attempt = token; running = false; stopLogin();
        try { if (runtime != null) runtime.cancelMyCrewCareObservationV3ForReview(); }
        catch (RuntimeException error) { stopFailed = true; }
        cleanup(attempt, "Cancelado. Nada importado.");
    }
    private void finish(long attempt, String message) { finish(attempt, message, false); }
    private void finish(long attempt, String message, boolean preview) {
        if (attempt != token || !running) return;
        running = false; stopLogin();
        cleanup(attempt, message, preview);
    }
    private void cleanup(long attempt, String message) { cleanup(attempt, message, false); }
    private void cleanup(long attempt, String message, boolean preview) {
        final long publicationEpoch = previewEpoch; // Capture before any native cleanup callback.
        cleaning = true;
        String operation = UUID.randomUUID().toString();
        try {
            if (runtime == null || !runtime.startMyCrewCareCleanupV3(account, true, operation)) {
                cleanupFailed(); return;
            }
        } catch (RuntimeException error) { cleanupFailed(); return; }
        checkCleanup(attempt, publicationEpoch, operation, message, preview, 0);
    }
    private void checkCleanup(long attempt, long publicationEpoch, String operation, String message, boolean preview, int polls) {
        if (attempt != token) return;
        String outcome = runtime.myCrewCareCleanupResultV3(account, operation);
        if (outcome.equals("pending") && polls < 300) {
            if (!destroyed) status.setText("Limpando o perfil de teste; resultado ainda não concluído." + diagnosticSuffix());
            main.postDelayed(() -> checkCleanup(attempt, publicationEpoch, operation, message, preview, polls + 1), 100);
            return;
        }
        if (!outcome.equals("ok") || stopFailed) { cleanupFailed(); return; }
        cleaning = false;
        if (!destroyed) {
            // Commit only while the exact attempt still owns visible presentation.
            // Never increment token to revoke preview: cleanup/error polling must settle.
            // Revocation guards only the reservation preview; failure/cancel reasons stay visible on return.
            boolean mayPublish = !preview || attempt == token && publicationEpoch == previewEpoch && foreground;
            status.setText((mayPublish ? message : "Resultado revogado. Nada importado." + diagnosticSuffix()) + " Perfil de teste limpo.");
            attemptControls(false); prepare.setEnabled(true);
        }
    }
    private void cleanupFailed() {
        cleanupTerminalFailure = true; // Terminal latch: cancel/stop cannot relabel it as pending.
        // Keep retry disabled: never announce cleanup success or reuse an unverified profile.
        if (!destroyed) status.setText("Limpeza do perfil não confirmada ou encerramento incompleto. Teste bloqueado; nada importado." + diagnosticSuffix());
    }
    @Override protected void onStop() {
        foreground = false;
        final Login current = login;
        if (running && preparing && current != null && !cleaning && backgroundDeadline == null) {
            // Somente o login visível: sair para app de MFA/e-mail não destrói a tentativa de imediato.
            // A leitura (handoff já feito) continua cancelando ao sair do primeiro plano.
            final long attempt = token;
            backgroundDeadline = () -> {
                backgroundDeadline = null;
                if (!foreground && login == current && attempt == token && running) {
                    synchronized (current) { if (login != current || current.revoked) return; current.revoked = true; }
                    preparationFailure = PreparationFailure.BACKGROUND; preparationFailureAttempt = attempt;
                    finish(attempt, "Preparação interrompida [" + PreparationFailure.BACKGROUND.code + "]: " + PreparationFailure.BACKGROUND.description
                        + ". Nada importado; nenhuma sessão ficou conectada. " + nextStep(PreparationFailure.BACKGROUND)
                        + " Matrícula e usuário foram mantidos; para tentar de novo, marque a autorização.");
                }
            };
            main.postDelayed(backgroundDeadline, LOGIN_BACKGROUND_GRACE_MS);
        } else cancel();
        super.onStop();
    }
    @Override protected void onDestroy() {
        if (backgroundDeadline != null) { main.removeCallbacks(backgroundDeadline); backgroundDeadline = null; }
        foreground = false; cancel(); destroyed = true;
        if (runtime != null) runtime.destroy();
        super.onDestroy();
    }
}
