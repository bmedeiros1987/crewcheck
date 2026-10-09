package com.crewcheck.app;

import android.app.Activity;
import android.webkit.WebView;
import android.widget.FrameLayout;

/**
 * Release-disabled boundary for the future provider connection.
 *
 * The persistence, cache and reconciliation layers can compile and be reviewed
 * without enabling navigation, authentication or data acquisition. A later,
 * separately reviewed provider adapter must supply the real connection flow.
 */
public final class CrewCheckMyCrewCarePortalV3 {
    public static final int PROTOCOL_VERSION = 3;
    public static final boolean RELEASE_ENABLED = false;

    public interface ProviderVerifier {
        boolean isReady();
    }

    private final Activity activity;
    private final CrewCheckMyCrewCareProfile profiles;

    public CrewCheckMyCrewCarePortalV3(
            Activity activity,
            FrameLayout root,
            WebView mainWebView,
            CrewCheckMyCrewCareProfile profiles,
            ProviderVerifier verifier
    ) {
        this.activity = activity;
        this.profiles = profiles;
    }

    public boolean isReady() {
        return false;
    }

    public boolean open(String requestJson, boolean automaticConsent) {
        return false;
    }

    public boolean disconnect(String accountId, boolean forgetProfile, Runnable completion) {
        if (activity == null || profiles == null || accountId == null || accountId.trim().isEmpty()) return false;
        if (forgetProfile) profiles.clear(activity, accountId, completion);
        else if (completion != null) completion.run();
        return true;
    }

    public void cancelVisible() { }

    public boolean isVisible() {
        return false;
    }

    public void destroy() { }
}
