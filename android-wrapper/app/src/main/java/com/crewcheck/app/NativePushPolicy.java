package com.crewcheck.app;

/** Public Firebase identity, independently checked in Console. No credentials. */
public final class NativePushPolicy {
    private NativePushPolicy() {}
    public static final boolean ENABLED = false;
    public static final String PROJECT_ID = "api-project-627296893301";
    public static final String SENDER_ID = "627296893301";
    public static final String APP_ID = "1:627296893301:android:5e12bb9377ceb7e4befb3c";
    // The existing public SDK config has not been imported/approved for this build.
    public static final String PUBLIC_API_KEY = "";
    public static boolean configured() {
        return ENABLED && PUBLIC_API_KEY.matches("AIza[A-Za-z0-9_-]{35}");
    }
}
