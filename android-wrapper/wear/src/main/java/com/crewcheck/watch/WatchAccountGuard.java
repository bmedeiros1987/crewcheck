package com.crewcheck.watch;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.regex.Pattern;

/**
 * Conta dona da escala no relógio, para os dois caminhos (Bluetooth e nuvem).
 *
 * O celular marca cada resumo com a conta (o mesmo hash que o servidor usa na credencial)
 * e, no logout ou na troca de conta, publica "conta X aposentada em T" (um item por conta,
 * horário do próprio celular). Aqui:
 *  - resumo de uma conta aposentada gerado até T é recusado: um item antigo que o Data Layer
 *    ainda entregue ou que o Sincronizar reimporte não reaparece nem notifica; gerado depois
 *    de T é um novo login dessa conta e volta a valer;
 *  - outra conta (resumo ou credencial) apaga a escala, os avisos e o pareamento da anterior
 *    antes de qualquer gravação, em qualquer ordem de entrega;
 *  - a primeira conta conhecida apaga o cache legado sem dono;
 *  - depois de conhecer uma conta, resumo sem dono é recusado. Antes disso (celular antigo,
 *    sem marca) o relógio continua aceitando como sempre.
 * Tudo sob {@link WatchCloudCredentialStore#LOCK}, a mesma trava dos efeitos da nuvem.
 */
public final class WatchAccountGuard {
    static final Pattern ACCOUNT = Pattern.compile("^[0-9a-f]{32}$");
    private static final String PREFS = "crewcheck_watch_account";
    private static final String KEY_CURRENT = "current_v1";
    private static final String KEY_AWARE = "aware_v1";
    private static final String KEY_LAST_SEEN = "last_seen_v1";
    private static final String RETIRED_PREFIX = "retired_v1:";

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
        synchronized (WatchCloudCredentialStore.LOCK) {
            if (!admit(app, snapshot.account, snapshot.generatedAtEpochMs)) return null;
            WatchContextSnapshot saved = new SecureSnapshotStore(app).save(rawJson);
            if (notify) WatchNotificationCenter.postForSnapshot(app, saved);
            return saved;
        }
    }

    /** Aplica a regra de conta; quem chama segura LOCK e grava em seguida se true. */
    static boolean admit(Context context, String account, long generatedAtEpochMs) {
        SharedPreferences prefs = prefs(context);
        if (account == null || account.isEmpty()) return !prefs.getBoolean(KEY_AWARE, false);
        if (!ACCOUNT.matcher(account).matches()) return false;
        long retiredAt = prefs.getLong(RETIRED_PREFIX + account, Long.MIN_VALUE);
        if (retiredAt != Long.MIN_VALUE) {
            if (generatedAtEpochMs <= retiredAt) return false;
            prefs.edit().remove(RETIRED_PREFIX + account).commit(); // novo login dessa conta
        }
        String current = prefs.getString(KEY_CURRENT, null);
        if (!account.equals(current)) switchTo(context, account, current);
        long lastSeen = prefs.getLong(KEY_LAST_SEEN, 0L);
        if (generatedAtEpochMs > lastSeen) prefs.edit().putLong(KEY_LAST_SEEN, generatedAtEpochMs).commit();
        return true;
    }

    /** Credencial da nuvem para uma conta: mesma transição, sem gravar escala. */
    static void credentialFor(Context context, String account) {
        SharedPreferences prefs = prefs(context);
        String current = prefs.getString(KEY_CURRENT, null);
        if (!account.equals(current)) switchTo(context, account, current);
    }

    /** "Conta X aposentada em T" vinda do celular (logout ou troca de conta). */
    public static void retire(Context context, String account, long retiredAtEpochMs) {
        if (account == null || !ACCOUNT.matcher(account).matches() || retiredAtEpochMs <= 0L) return;
        Context app = context.getApplicationContext();
        synchronized (WatchCloudCredentialStore.LOCK) {
            SharedPreferences prefs = prefs(app);
            long known = prefs.getLong(RETIRED_PREFIX + account, Long.MIN_VALUE);
            SharedPreferences.Editor edit = prefs.edit()
                    .putLong(RETIRED_PREFIX + account, Math.max(known, retiredAtEpochMs))
                    .putBoolean(KEY_AWARE, true);
            boolean wasCurrent = account.equals(prefs.getString(KEY_CURRENT, null));
            if (wasCurrent) edit.remove(KEY_CURRENT).remove(KEY_LAST_SEEN);
            edit.commit();
            if (wasCurrent) clearAccountData(app);
            // Não depende da ordem do Data Layer: a credencial dessa conta sai junto.
            WatchCloudCredentialStore.Pairing pairing = new WatchCloudCredentialStore(app).current();
            if (pairing != null && account.equals(pairing.owner)) {
                new WatchCloudCredentialStore(app).clear();
                WatchCloudSyncJob.cancel(app);
            }
        }
    }

    private static void switchTo(Context context, String account, String previous) {
        SharedPreferences prefs = prefs(context);
        SharedPreferences.Editor edit = prefs.edit();
        // Troca sem aviso explícito: a anterior fica aposentada até o último resumo visto dela.
        if (previous != null) edit.putLong(RETIRED_PREFIX + previous,
                Math.max(prefs.getLong(RETIRED_PREFIX + previous, Long.MIN_VALUE), prefs.getLong(KEY_LAST_SEEN, 0L)));
        edit.putString(KEY_CURRENT, account).putBoolean(KEY_AWARE, true).remove(KEY_LAST_SEEN).commit();
        clearAccountData(context);
        WatchCloudCredentialStore.Pairing pairing = new WatchCloudCredentialStore(context).current();
        if (pairing != null && !account.equals(pairing.owner)) {
            new WatchCloudCredentialStore(context).clear();
            WatchCloudSyncJob.cancel(context);
        }
    }

    private static void clearAccountData(Context context) {
        new SecureSnapshotStore(context).clear();
        WatchNotificationCenter.clear(context);
    }

    static String current(Context context) {
        return prefs(context).getString(KEY_CURRENT, null);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
