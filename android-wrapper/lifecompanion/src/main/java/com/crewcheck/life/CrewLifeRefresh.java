package com.crewcheck.life;

import android.content.Context;

final class CrewLifeRefresh {
    private CrewLifeRefresh() {}

    static boolean refreshNow(Context context) {
        try {
            if (!SamsungHealthRuntime.sdkBundled()) return false;
            org.json.JSONObject status = SamsungHealthRuntime.status(context);
            if (!"connected".equals(status.optString("state"))) return false;
            org.json.JSONObject summary = SamsungHealthRuntime.readSummary(context);
            LifeSummaryStore.save(context, summary);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }
}
