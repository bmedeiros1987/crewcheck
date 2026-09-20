package com.crewcheck.watch;

/** Stable phone-to-watch contract. The watch consumes canonical data and never parses rosters. */
public final class WatchContract {
    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_SNAPSHOT_BYTES = 16 * 1024;

    public static final String SNAPSHOT_PATH = "/crewcheck/watch/context/v1";
    public static final String REQUEST_SYNC_PATH = "/crewcheck/watch/request-sync/v1";
    public static final String DATA_KEY_SNAPSHOT_JSON = "snapshotJson";

    private WatchContract() {
    }
}
