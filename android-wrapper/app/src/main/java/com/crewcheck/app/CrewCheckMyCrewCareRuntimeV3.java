package com.crewcheck.app;

import android.app.Activity;
import android.webkit.WebView;
import android.widget.FrameLayout;

import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

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
    private final CrewCheckMyCrewCarePortalV3.ObservedAcquisition observations = new CrewCheckMyCrewCarePortalV3.ObservedAcquisition();

    private static final Pattern OPERATION_ID = Pattern.compile("^[A-Za-z0-9_-]{8,80}$");
    private static final int MAX_CLEANUP_OPERATIONS = 32;
    private static final String PENDING = "pending";

    /** One entry per account + operation id. Value: pending | ok | failed:code. */
    private final ConcurrentHashMap<String, String> cleanups = new ConcurrentHashMap<>();

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

    /** Review-only injected boundary: no JavascriptInterface, provider navigation or operational cache. */
    public boolean observeMyCrewCareV3ForReview(CrewCheckMyCrewCarePortalV3.ObservedScope scope,
            CrewCheckMyCrewCarePortalV3.ObservedSource source,
            CrewCheckMyCrewCarePortalV3.ObservedDeadline deadline,
            CrewCheckMyCrewCarePortalV3.ObservedCompletion completion) {
        return observations.begin(scope, source, deadline, completion);
    }

    public void cancelMyCrewCareObservationV3ForReview() { observations.cancel(); }

    public int myCrewCareProtocolVersion() {
        return CrewCheckMyCrewCarePortalV3.PROTOCOL_VERSION;
    }

    public boolean myCrewCareReleaseEnabled() {
        return CrewCheckMyCrewCarePortalV3.RELEASE_ENABLED && portal.isReady();
    }

    public boolean openMyCrewCareV3(String requestJson, boolean automaticConsent) {
        return portal.open(requestJson, automaticConsent);
    }

    /**
     * Starts an account-scoped cleanup and returns whether it was accepted. The outcome is read
     * with {@link #myCrewCareCleanupResultV3}; nothing here reports success before it happened.
     */
    public boolean startMyCrewCareCleanupV3(String accountId, boolean forgetData, String operationId) {
        if (accountId == null || accountId.trim().isEmpty()
                || operationId == null || !OPERATION_ID.matcher(operationId).matches()) return false;
        if (cleanups.size() >= MAX_CLEANUP_OPERATIONS) cleanups.entrySet().removeIf(entry -> !PENDING.equals(entry.getValue()));
        if (cleanups.size() >= MAX_CLEANUP_OPERATIONS) return false;
        final String key = cleanupKey(accountId, operationId);
        if (cleanups.putIfAbsent(key, PENDING) != null) return false;

        final boolean cacheCleared = !forgetData || store.clear(accountId);
        boolean accepted;
        try {
            accepted = portal.disconnect(accountId, forgetData, (success, code) -> {
                if (!cacheCleared) cleanups.put(key, "failed:cache-clear-failed");
                else cleanups.put(key, success ? "ok" : "failed:" + safeCode(code));
            });
        } catch (RuntimeException error) {
            accepted = false;
        }
        if (!accepted) cleanups.put(key, "failed:disconnect-rejected");
        return true;
    }

    /** pending | ok | failed:code | unknown, only for the same account and operation id that started it. */
    public String myCrewCareCleanupResultV3(String accountId, String operationId) {
        if (accountId == null || operationId == null) return "unknown";
        String value = cleanups.get(cleanupKey(accountId, operationId));
        return value == null ? "unknown" : value;
    }

    private static String cleanupKey(String accountId, String operationId) {
        return accountId.trim().length() + ":" + accountId.trim() + "|" + operationId;
    }

    private static String safeCode(String code) {
        return code != null && code.matches("^[a-z0-9-]{1,40}$") ? code : "cleanup-failed";
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
        observations.cancel();
        portal.cancelVisible();
    }

    public boolean isVisible() {
        return portal.isVisible();
    }

    public void destroy() {
        observations.cancel();
        portal.destroy();
    }
}
