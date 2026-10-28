package com.crewcheck.watch;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Conta dona da escala no relógio, para os dois caminhos (Bluetooth e nuvem).
 *
 * O celular mantém uma época de conta que só muda numa transição explícita (login de outra
 * conta ou logout) e sempre cresce. Ele publica o estado {conta, época} em
 * {@link WatchContract#ACCOUNT_PATH} e carimba a época vigente em cada resumo e credencial.
 * Aqui, para qualquer item (estado, credencial, resumo por mensagem, Data Layer ou
 * Sincronizar):
 *  - época menor que a conhecida: item de uma conta ou sessão anterior, recusado, mesmo que
 *    gerado depois do último resumo visto (o horário do resumo não prova login);
 *  - mesma época: vale para a mesma conta ou sem conta (o celular só carimba a época atual
 *    num resumo sem conta, como o de sessão expirada);
 *  - época maior: é a transição. Escala, avisos e pareamento da nuvem saem antes de gravar,
 *    em qualquer ordem de entrega; um estado antigo reaplicado não volta nada;
 *  - a primeira época apaga o cache legado sem dono; depois dela, item sem época é recusado.
 *    Antes disso (celular sem esta versão) tudo segue como sempre.
 * Tudo sob {@link WatchCloudCredentialStore#LOCK}, a mesma trava dos efeitos da nuvem.
 */
public final class WatchAccountGuard {
    static final Pattern ACCOUNT = Pattern.compile("^[0-9a-f]{32}$");
    private static final String PREFS = "crewcheck_watch_account";
    private static final String KEY_ACCOUNT = "account_v2";
    private static final String KEY_EPOCH = "epoch_v2";

    private WatchAccountGuard() {
    }

    /**
     * Entrada única de escala no relógio. Grava e notifica só o que pertence à conta vigente.
     * @return o resumo gravado, ou null quando recusado.
     */
    public static WatchContextSnapshot intake(Context context, String rawJson) {
        return intake(context, rawJson, true);
    }

    /** Sincronizar reimporta sem notificar, como antes; a regra de conta vale igual. */
    public static WatchContextSnapshot intake(Context context, String rawJson, boolean notify) {
        Context app = context.getApplicationContext();
        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(rawJson);
        long epoch = epochOf(rawJson);
        synchronized (WatchCloudCredentialStore.LOCK) {
            if (!admit(app, snapshot.account, epoch)) return null;
            WatchContextSnapshot saved = new SecureSnapshotStore(app).save(rawJson);
            if (notify) WatchNotificationCenter.postForSnapshot(app, saved);
            return saved;
        }
    }

    /** Estado de conta publicado pelo celular: login, troca ou logout (conta vazia). */
    public static void bind(Context context, String account, long epoch) {
        if (epoch <= 0L) return;
        Context app = context.getApplicationContext();
        synchronized (WatchCloudCredentialStore.LOCK) {
            admit(app, account, epoch);
        }
    }

    /** Aplica a regra de conta; quem chama segura LOCK e grava em seguida se true. */
    static boolean admit(Context context, String account, long epoch) {
        String owner = account == null ? "" : account;
        if (!owner.isEmpty() && !ACCOUNT.matcher(owner).matches()) return false;
        SharedPreferences prefs = prefs(context);
        long known = prefs.getLong(KEY_EPOCH, 0L);
        if (epoch <= 0L) return known == 0L;
        if (epoch < known) return false;
        // Sem conta na época vigente: sessão expirada ou sem e-mail no próprio celular, que só
        // carimba a época atual; nunca é outra conta.
        if (epoch == known) return owner.isEmpty() || owner.equals(prefs.getString(KEY_ACCOUNT, ""));
        prefs.edit().putString(KEY_ACCOUNT, owner).putLong(KEY_EPOCH, epoch).commit();
        new SecureSnapshotStore(context).clear();
        WatchNotificationCenter.clear(context);
        new WatchCloudCredentialStore(context).clear();
        WatchCloudSyncJob.cancel(context);
        return true;
    }

    /** A conta vigente (época conhecida) é esta; quem chama segura LOCK. */
    static boolean isCurrent(Context context, String account) {
        SharedPreferences prefs = prefs(context);
        return account != null && !account.isEmpty() && prefs.getLong(KEY_EPOCH, 0L) > 0L
                && account.equals(prefs.getString(KEY_ACCOUNT, ""));
    }

    static long epochOf(String rawJson) {
        try {
            return new JSONObject(rawJson).optLong("accountEpoch", 0L);
        } catch (Exception error) {
            return 0L;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
