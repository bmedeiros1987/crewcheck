package com.crewcheck.life;

import android.content.Context;

import org.json.JSONObject;

final class LifeSummaryStore {
    private static final String PREFS = "crewlife_companion_summary";
    private static final String KEY_JSON = "summary_json";

    private LifeSummaryStore() {}

    static void save(Context context, JSONObject summary) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_JSON, summary == null ? "" : summary.toString())
                .apply();
    }

    static String read(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_JSON, "");
    }

    static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
