package com.crewcheck.app;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

/**
 * Lets the watch request the phone's last validated canonical projection even when the
 * CrewCheck Activity is not in the foreground.
 */
public final class CrewCheckWatchSyncService extends WearableListenerService {
    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (!CrewCheckWatchPublisher.REQUEST_SYNC_PATH.equals(messageEvent.getPath())) return;
        CrewCheckWatchPublisher.republishLast(this);
    }
}
