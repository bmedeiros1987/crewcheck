package com.crewcheck.watch;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.RemoteException;

import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.LongTextComplicationData;
import androidx.wear.watchface.complications.data.MonochromaticImage;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.RangedValueComplicationData;
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
 * Aqui montamos o dado: SHORT_TEXT e LONG_TEXT, os tipos já publicados pelo provider assinado
 * em campo, mais RANGED_VALUE quando o provider tem uma medida 0–100 para o slot de anel.
 *
 * Todo dado sai com ícone monocromático: sem ele, o slot fica só com texto curto e muitas
 * faces não exibem nada reconhecível como CrewCheck.
 */
abstract class BaseComplicationService extends ComplicationDataSourceService {

    /** Recuperação e Energia Samsung são ambas 0–100. */
    private static final float RING_MIN = 0f;
    private static final float RING_MAX = 100f;

    /**
     * @param preview true quando o sistema pede a amostra exibida no seletor de complicações,
     *                caso em que o provider usa dados de demonstração e nunca o cache real.
     */
    protected abstract ComplicationRendering render(long nowEpochMs, boolean preview);

    /** Código distinto por provider para que os PendingIntents não se sobrescrevam. */
    protected abstract int tapRequestCode();

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
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PlainComplicationText descriptionText = text(rendering.description);
        MonochromaticImage icon = icon();

        if (ComplicationType.LONG_TEXT.equals(type)) {
            return new LongTextComplicationData.Builder(text(rendering.longText), descriptionText)
                    .setTitle(text(rendering.title))
                    .setMonochromaticImage(icon)
                    .setTapAction(tapAction)
                    .build();
        }

        if (ComplicationType.RANGED_VALUE.equals(type)) {
            // Sem medida não há anel: devolver zero desenharia saúde que ninguém mediu.
            if (rendering.rangedValue == null) return null;
            return new RangedValueComplicationData.Builder(
                    rendering.rangedValue, RING_MIN, RING_MAX, descriptionText)
                    .setText(text(rendering.shortText))
                    .setTitle(text(rendering.title))
                    .setMonochromaticImage(icon)
                    .setTapAction(tapAction)
                    .build();
        }

        if (!ComplicationType.SHORT_TEXT.equals(type)) {
            // Devolver um tipo que a face não pediu faz o sistema descartar o dado e o slot
            // fica vazio sem explicação. Null é a resposta correta para tipo não suportado.
            return null;
        }

        return new ShortTextComplicationData.Builder(text(rendering.shortText), descriptionText)
                .setTitle(text(rendering.title))
                .setMonochromaticImage(icon)
                .setTapAction(tapAction)
                .build();
    }

    private MonochromaticImage icon() {
        return new MonochromaticImage.Builder(
                Icon.createWithResource(this, R.drawable.ic_crewcheck_complication)
        ).build();
    }

    private static PlainComplicationText text(String value) {
        return new PlainComplicationText.Builder(value).build();
    }
}
