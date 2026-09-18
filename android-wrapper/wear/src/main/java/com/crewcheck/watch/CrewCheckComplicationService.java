package com.crewcheck.watch;

import android.app.PendingIntent;
import android.content.Intent;

import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.LongTextComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;

/** Dynamic source used by CrewCheck Face and by third-party Wear OS watch faces. */
public final class CrewCheckComplicationService extends ComplicationDataSourceService {
    @Override
    public void onComplicationRequest(
            ComplicationRequest request,
            ComplicationRequestListener listener
    ) {
        listener.onComplicationData(buildData(request.getComplicationType(), false));
    }

    @Override
    public ComplicationData getPreviewData(ComplicationType type) {
        return buildData(type, true);
    }

    private ComplicationData buildData(ComplicationType type, boolean preview) {
        long now = System.currentTimeMillis();
        WatchContextSnapshot snapshot = preview
                ? WatchContextSnapshot.demo(now)
                : new SecureSnapshotStore(this).load();

        String shortText;
        String longText;
        String description;
        if (snapshot == null) {
            shortText = "ABRIR";
            longText = "Abra o CrewCheck no celular";
            description = "Abra o CrewCheck no celular para sincronizar a escala.";
        } else {
            shortText = snapshot.complicationShortText(now);
            longText = snapshot.complicationLongText(now);
            description = snapshot.accessibilityDescription(now);
        }

        PendingIntent tapAction = PendingIntent.getActivity(
                this,
                10,
                new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PlainComplicationText descriptionText = text(description);
        if (ComplicationType.LONG_TEXT.equals(type)) {
            return new LongTextComplicationData.Builder(text(longText), descriptionText)
                    .setTitle(text("CrewCheck"))
                    .setTapAction(tapAction)
                    .build();
        }

        return new ShortTextComplicationData.Builder(text(shortText), descriptionText)
                .setTitle(text("Crew"))
                .setTapAction(tapAction)
                .build();
    }

    private static PlainComplicationText text(String value) {
        return new PlainComplicationText.Builder(value).build();
    }
}
