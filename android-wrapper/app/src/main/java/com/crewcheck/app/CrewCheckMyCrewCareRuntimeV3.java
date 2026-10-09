package com.crewcheck.app;

import android.app.Activity;
import android.webkit.WebView;
import android.widget.FrameLayout;

/**
 * Unwired Mobile Core facade for the future MainActivity bridge.
 *
 * Keeping bridge methods here prevents the disconnected candidate from editing
 * MainActivity or Home before physical provider validation. A future reviewed
 * integration may delegate exact native bridge methods to this object.
 */
public final class CrewCheckMyCrewCareRuntimeV3 {
    private final CrewCheckMyCrewCareSecureStore store;
    private final CrewCheckMyCrewCarePortalV3 portal;

    public CrewCheckMyCrewCareRuntimeV3(
            Activity activity,
            FrameLayout root,
            WebView mainWebView,
            CrewCheckMyCrewCarePortalV3.ProviderVerifier verifier
    ) {
        CrewCheckMyCrewCareProfile profiles = new CrewCheckMyCrewCareProfile();
        store = new CrewCheckMyCrewCareSecureStore(activity);
        portal = new CrewCheckMyCrewCarePortalV3(activity, root, mainWebView, profiles, verifier);
    }

    public int myCrewCareProtocolVersion() {
        return CrewCheckMyCrewCarePortalV3.PROTOCOL_VERSION;
    }

    public boolean myCrewCareReleaseEnabled() {
        return CrewCheckMyCrewCarePortalV3.RELEASE_ENABLED && portal.isReady();
    }

    public boolean openMyCrewCareV3(String requestJson, boolean automaticConsent) {
        return portal.open(requestJson, automaticConsent);
    }

    public boolean disconnectMyCrewCareV3(String accountId, boolean forgetData) {
        if (forgetData) store.clear(accountId);
        return portal.disconnect(accountId, forgetData, null);
    }

    public String loadMyCrewCareV3State(String accountId) {
        return store.load(accountId);
    }

    public boolean saveMyCrewCareV3State(String accountId, String payload) {
        return store.save(accountId, payload);
    }

    public boolean clearMyCrewCareV3State(String accountId) {
        return store.clear(accountId);
    }

    public void cancelVisible() {
        portal.cancelVisible();
    }

    public boolean isVisible() {
        return portal.isVisible();
    }

    public void destroy() {
        portal.destroy();
    }
}
