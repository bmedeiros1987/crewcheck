package com.crewcheck.watch;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class WatchBackgroundSyncRequesterTest {
    @Test
    public void firstRequestIsAllowed() {
        assertTrue(WatchBackgroundSyncRequester.shouldRequest(1_000_000L, 0L, 0L));
    }

    @Test
    public void successfulRequestIsThrottledForFiveMinutes() {
        long success = 1_000_000L;
        assertFalse(WatchBackgroundSyncRequester.shouldRequest(
                success + WatchBackgroundSyncRequester.SUCCESS_INTERVAL_MS - 1L,
                success,
                success));
        assertTrue(WatchBackgroundSyncRequester.shouldRequest(
                success + WatchBackgroundSyncRequester.SUCCESS_INTERVAL_MS,
                success,
                success));
    }

    @Test
    public void failedOrDisconnectedAttemptRetriesAfterOneMinute() {
        long attempt = 1_000_000L;
        assertFalse(WatchBackgroundSyncRequester.shouldRequest(
                attempt + WatchBackgroundSyncRequester.RETRY_INTERVAL_MS - 1L,
                attempt,
                0L));
        assertTrue(WatchBackgroundSyncRequester.shouldRequest(
                attempt + WatchBackgroundSyncRequester.RETRY_INTERVAL_MS,
                attempt,
                0L));
    }

    @Test
    public void clockRollbackDoesNotCreateAThrottleLockout() {
        assertTrue(WatchBackgroundSyncRequester.shouldRequest(900_000L, 1_000_000L, 1_000_000L));
    }

    @Test
    public void invalidNowNeverSchedules() {
        assertFalse(WatchBackgroundSyncRequester.shouldRequest(0L, 0L, 0L));
    }
}
