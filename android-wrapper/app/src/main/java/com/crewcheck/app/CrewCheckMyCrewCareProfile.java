package com.crewcheck.app;

import android.app.Activity;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewBuilder;
import androidx.webkit.WebViewFeature;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Per-account WebView profile for MyCrewCare.
 *
 * The raw CrewCheck account identifier never becomes a profile name. Provider
 * session data is isolated from the main shell and from other CrewCheck accounts.
 * No global profile clearing is used.
 */
@WebViewBuilder.Experimental
public final class CrewCheckMyCrewCareProfile {
    private static final String PROFILE_PREFIX = "crewcheck_mcc_v3_";
    private static final int MAX_ACCOUNT_ID_LENGTH = 240;

    public boolean isSupported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
                && WebViewFeature.isFeatureSupported(WebViewFeature.WEBVIEW_BUILDER_EXPERIMENTAL_V1);
    }

    @WebViewBuilder.Experimental
    public WebView create(Activity activity, String accountId) {
        if (activity == null) throw new IllegalArgumentException("activity-required");
        if (!isSupported()) throw new UnsupportedOperationException("isolated-webview-profile-unavailable");
        return new WebViewBuilder(WebViewBuilder.PRESET_LEGACY)
                .setProfile(profileName(accountId))
                .restrictJavaScriptInterfaces()
                .build(activity);
    }

    public void flush(String accountId) {
        if (!isSupported()) return;
        try {
            Profile profile = ProfileStore.getInstance().getProfile(profileName(accountId));
            if (profile != null) profile.getCookieManager().flush();
        } catch (RuntimeException ignored) {
            // Foreground verification remains authoritative if persistence is unavailable.
        }
    }

    /** Clears only the selected MyCrewCare profile data. */
    public void clear(Activity activity, String accountId, Runnable completion) {
        Runnable done = once(completion);
        if (activity == null || !isSupported()) {
            done.run();
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                Profile profile = ProfileStore.getInstance().getProfile(profileName(accountId));
                if (profile == null) { done.run(); return; }
                try { profile.getWebStorage().deleteAllData(); } catch (RuntimeException ignored) { }
                try { profile.getGeolocationPermissions().clearAll(); } catch (RuntimeException ignored) { }
                CookieManager manager = profile.getCookieManager();
                manager.removeAllCookies(removed -> {
                    try { manager.flush(); } catch (RuntimeException ignored) { }
                    done.run();
                });
            } catch (RuntimeException error) {
                done.run();
            }
        });
    }

    static String profileName(String accountId) {
        String normalized = accountId == null ? "" : accountId.trim();
        if (normalized.isEmpty() || normalized.length() > MAX_ACCOUNT_ID_LENGTH || containsControlCharacter(normalized)) {
            throw new IllegalArgumentException("invalid-account-id");
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(PROFILE_PREFIX);
            for (int index = 0; index < 16; index += 1) result.append(String.format(Locale.ROOT, "%02x", digest[index]));
            return result.toString();
        } catch (Exception error) {
            throw new IllegalStateException("account-profile-hash-failed", error);
        }
    }

    private static boolean containsControlCharacter(String value) {
        for (int index = 0; index < value.length(); index += 1) {
            char current = value.charAt(index);
            if (current < 0x20 || current == 0x7f) return true;
        }
        return false;
    }

    private static Runnable once(Runnable completion) {
        AtomicBoolean called = new AtomicBoolean(false);
        return () -> {
            if (called.compareAndSet(false, true) && completion != null) completion.run();
        };
    }
}
