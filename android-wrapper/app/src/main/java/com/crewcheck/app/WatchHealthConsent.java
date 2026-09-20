package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Opt-in explícito e granular para enviar bem-estar ao relógio.
 *
 * Separado do consentimento do Health Connect no celular de propósito: autorizar o CrewCheck
 * a ler sono não autoriza o CrewCheck a espelhar sono no pulso, que é uma tela que outras
 * pessoas enxergam. Sem registro aqui, nada de saúde sai para o relógio.
 *
 * Fail-closed em três pontos: o padrão é tudo desligado; versão de consentimento diferente
 * da vigente invalida o registro inteiro em vez de migrar sozinha; e categoria não concedida
 * some do payload em vez de ir zerada (zero é um valor de saúde, não "sem dado").
 */
public final class WatchHealthConsent {
    /** Precisa acompanhar CrewCheckHealthBridge.CONSENT_VERSION. */
    public static final String CONSENT_VERSION = "1.0";

    public static final String CATEGORY_RECOVERY = "recovery";
    public static final String CATEGORY_SLEEP = "sleep";
    public static final String CATEGORY_ACTIVITY = "activity";
    public static final String CATEGORY_HEART = "heart";
    public static final String CATEGORY_ROUTINE = "routine";

    public static final Set<String> CATEGORIES = Set.of(
            CATEGORY_RECOVERY,
            CATEGORY_SLEEP,
            CATEGORY_ACTIVITY,
            CATEGORY_HEART,
            CATEGORY_ROUTINE
    );

    private static final String PREFS = "crewcheck_watch_health_consent";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_VERSION = "consent_version";
    private static final String KEY_CATEGORIES = "categories";
    private static final String KEY_ACCEPTED_AT = "accepted_at_epoch_ms";

    private final boolean enabled;
    private final String version;
    private final Set<String> categories;
    private final long acceptedAtEpochMs;

    private WatchHealthConsent(
            boolean enabled,
            String version,
            Set<String> categories,
            long acceptedAtEpochMs
    ) {
        this.enabled = enabled;
        this.version = version;
        this.categories = Collections.unmodifiableSet(new LinkedHashSet<>(categories));
        this.acceptedAtEpochMs = acceptedAtEpochMs;
    }

    public static WatchHealthConsent read(Context context) {
        SharedPreferences prefs = prefs(context);
        Set<String> stored = prefs.getStringSet(KEY_CATEGORIES, Collections.emptySet());
        return new WatchHealthConsent(
                prefs.getBoolean(KEY_ENABLED, false),
                prefs.getString(KEY_VERSION, ""),
                normalize(stored),
                prefs.getLong(KEY_ACCEPTED_AT, 0L)
        );
    }

    /**
     * Registra o opt-in. Versão desconhecida não é migrada: o consentimento é descartado e o
     * usuário precisa aceitar de novo.
     */
    public static WatchHealthConsent grant(Context context, String consentVersion, Set<String> categories) {
        if (!CONSENT_VERSION.equals(consentVersion)) {
            return revoke(context);
        }
        Set<String> granted = normalize(categories);
        if (granted.isEmpty()) {
            return revoke(context);
        }
        prefs(context).edit()
                .putBoolean(KEY_ENABLED, true)
                .putString(KEY_VERSION, CONSENT_VERSION)
                .putStringSet(KEY_CATEGORIES, new HashSet<>(granted))
                .putLong(KEY_ACCEPTED_AT, System.currentTimeMillis())
                .apply();
        return read(context);
    }

    public static WatchHealthConsent revoke(Context context) {
        prefs(context).edit()
                .putBoolean(KEY_ENABLED, false)
                .remove(KEY_VERSION)
                .remove(KEY_CATEGORIES)
                .remove(KEY_ACCEPTED_AT)
                .apply();
        return read(context);
    }

    public boolean isActive() {
        return enabled && CONSENT_VERSION.equals(version) && !categories.isEmpty();
    }

    public boolean allows(String category) {
        return isActive() && categories.contains(category);
    }

    public Set<String> categories() {
        return isActive() ? categories : Collections.emptySet();
    }

    public long acceptedAtEpochMs() {
        return acceptedAtEpochMs;
    }

    /** Descarta categoria desconhecida em vez de aceitar o que não sabe filtrar. */
    private static Set<String> normalize(Set<String> categories) {
        Set<String> granted = new LinkedHashSet<>();
        if (categories == null) return granted;
        for (String category : categories) {
            if (category == null) continue;
            String value = category.trim().toLowerCase(java.util.Locale.ROOT);
            if (CATEGORIES.contains(value)) granted.add(value);
        }
        return granted;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
