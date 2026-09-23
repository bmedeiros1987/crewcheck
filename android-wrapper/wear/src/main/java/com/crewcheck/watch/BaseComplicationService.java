package com.crewcheck.watch;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.RemoteException;

import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.LongTextComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;

/**
 * Plumbing shared by every CrewCheck complication data source.
 *
 * No seletor do Wear OS o usuário escolhe uma FONTE DE DADOS, não um slot. Por isso cada
 * domínio (próximo passo, portão, CrewLife, rotina) precisa do seu próprio serviço exportado:
 * só assim a mesma face — inclusive faces de terceiros — consegue exibir dois dados CrewCheck
 * ao mesmo tempo.
 *
 * A decisão de texto fica em {@link ComplicationText}, fora do Android, para ser testável.
 * Aqui só emitimos SHORT_TEXT e LONG_TEXT, os mesmos tipos já publicados pelo provider
 * assinado em campo.
 */
abstract class BaseComplicationService extends ComplicationDataSourceService {

    /**
     * @param preview true quando o sistema pede a amostra exibida no seletor de complicações,
     *                caso em que o provider usa dados de demonstração e nunca o cache real.
     */
    protected abstract ComplicationRendering render(long nowEpochMs, boolean preview);

    /** Código distinto por provider para que os PendingIntents não se sobrescrevam. */
    protected abstract int tapRequestCode();

    /** Tela contextual aberta quando o usuário toca na complicação. */
    protected String tapScreen() {
        return "now";
    }

    @Override
    public void onComplicationRequest(
            ComplicationRequest request,
            ComplicationRequestListener listener
    ) {
        try {
            listener.onComplicationData(buildData(request.getComplicationType(), false));
        } catch (RemoteException ignored) {
            // The system complication host may disappear before the asynchronous reply arrives.
        }
    }

    @Override
    public ComplicationData getPreviewData(ComplicationType type) {
        return buildData(type, true);
    }

    private ComplicationData buildData(ComplicationType type, boolean preview) {
        ComplicationRendering rendering = render(System.currentTimeMillis(), preview);

        PendingIntent tapAction = PendingIntent.getActivity(
                this,
                tapRequestCode(),
                new Intent(this, MainActivity.class)
                        .putExtra("crewcheck_screen", tapScreen())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PlainComplicationText descriptionText = text(rendering.description);
        if (ComplicationType.LONG_TEXT.equals(type)) {
            return new LongTextComplicationData.Builder(text(rendering.longText), descriptionText)
                    .setTitle(text(rendering.title))
                    .setTapAction(tapAction)
                    .build();
        }

        return new ShortTextComplicationData.Builder(text(rendering.shortText), descriptionText)
                .setTitle(text(rendering.title))
                .setTapAction(tapAction)
                .build();
    }

    private static PlainComplicationText text(String value) {
        return new PlainComplicationText.Builder(value).build();
    }
}
