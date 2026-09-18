package com.crewcheck.watch.complication;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.RemoteException;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationText;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.LongTextComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;

import com.crewcheck.watch.MainActivity;
import com.crewcheck.watch.data.WatchStateStore;
import com.crewcheck.watch.model.WatchContextSnapshot;

abstract class AbstractCrewCheckComplicationService extends ComplicationDataSourceService {
    protected abstract String shortValue(WatchContextSnapshot snapshot);
    protected abstract String title(WatchContextSnapshot snapshot);
    protected abstract String longValue(WatchContextSnapshot snapshot);

    protected abstract String previewShort();
    protected abstract String previewTitle();
    protected abstract String previewLong();

    @Override
    public void onComplicationRequest(
            @NonNull ComplicationRequest request,
            @NonNull ComplicationRequestListener listener
    ) {
        WatchContextSnapshot snapshot = new WatchStateStore(this).load().snapshot;
        try {
            listener.onComplicationData(build(
                    request.getComplicationType(),
                    shortValue(snapshot),
                    title(snapshot),
                    longValue(snapshot)
            ));
        } catch (RemoteException ignored) {
            // The watch-face binder may disappear while the request is in flight.
            // The next platform update request will recover without losing cached data.
        }
    }

    @Nullable
    @Override
    public ComplicationData getPreviewData(@NonNull ComplicationType type) {
        return build(type, previewShort(), previewTitle(), previewLong());
    }

    private ComplicationData build(
            ComplicationType type,
            String shortValue,
            String title,
            String longValue
    ) {
        ComplicationText description = text(title + ": " + longValue);
        PendingIntent tapAction = PendingIntent.getActivity(
                this,
                getClass().getName().hashCode(),
                new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (ComplicationType.LONG_TEXT.equals(type)) {
            return new LongTextComplicationData.Builder(text(longValue), description)
                    .setTitle(text(title))
                    .setTapAction(tapAction)
                    .build();
        }

        return new ShortTextComplicationData.Builder(
                text(limit(shortValue, 7)),
                description
        )
                .setTitle(text(limit(title, 7)))
                .setTapAction(tapAction)
                .build();
    }

    private static PlainComplicationText text(String value) {
        return new PlainComplicationText.Builder(
                value == null || value.isBlank() ? "—" : value
        ).build();
    }

    private static String limit(String value, int maxCodePoints) {
        if (value == null || value.isBlank()) return "—";
        int count = value.codePointCount(0, value.length());
        if (count <= maxCodePoints) return value;
        int end = value.offsetByCodePoints(0, maxCodePoints);
        return value.substring(0, end);
    }
}
