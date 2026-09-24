package com.crewcheck.watch;

/** Stable portable phone-to-watch protocol. The watch consumes canonical data and never parses rosters. */
public final class WatchContract {
    public static final String SNAPSHOT_PROTOCOL = "watchSnapshotV1";
    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_SNAPSHOT_BYTES = 16 * 1024;

    public static final String SNAPSHOT_PATH = "/crewcheck/watch/context/v1";
    public static final String REQUEST_SYNC_PATH = "/crewcheck/watch/request-sync/v1";
    public static final String DATA_KEY_SNAPSHOT_JSON = "snapshotJson";

    /**
     * Wellbeing and routine use independent channels and never become part of the operational snapshot.
     * This keeps watchSnapshotV1 backwards compatible and lets Premium data be revoked without removing
     * the Free roster projection.
     */
    public static final int CREWLIFE_SCHEMA_VERSION = 1;
    public static final int ROUTINE_SCHEMA_VERSION = 1;
    public static final int MAX_WELLBEING_BYTES = 4 * 1024;
    public static final String CREWLIFE_PATH = "/crewcheck/watch/crewlife/v1";
    public static final String ROUTINE_PATH = "/crewcheck/watch/routine/v1";
    public static final String DATA_KEY_CREWLIFE_JSON = "crewLifeJson";
    public static final String DATA_KEY_ROUTINE_JSON = "routineJson";

    public static final int CONCIERGE_SCHEMA_VERSION = 1;
    public static final int MAX_CONCIERGE_BYTES = 4 * 1024;
    public static final String CONCIERGE_REQUEST_PATH = "/crewcheck/watch/concierge/request/v1";
    public static final String CONCIERGE_RESPONSE_PATH = "/crewcheck/watch/concierge/response/v1";
    public static final String DATA_KEY_CONCIERGE_RESPONSE_JSON = "conciergeResponseJson";

    private WatchContract() {}
}
