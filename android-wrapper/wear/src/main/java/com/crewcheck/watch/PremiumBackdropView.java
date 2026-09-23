package com.crewcheck.watch;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.view.View;

/**
 * Lightweight decorative layer for CrewWatch.
 *
 * Static on purpose: premium depth without a permanent animation loop or battery cost.
 */
public final class PremiumBackdropView extends View {
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint softArc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);

    public PremiumBackdropView(Context context) {
        super(context);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        softArc.setStyle(Paint.Style.STROKE);
        softArc.setStrokeCap(Paint.Cap.ROUND);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth();
        float h = getHeight();
        if (w <= 0 || h <= 0) return;

        canvas.drawColor(Color.rgb(3, 9, 20));

        halo.setShader(new RadialGradient(
                w * 0.5f,
                h * 0.22f,
                Math.max(w, h) * 0.58f,
                new int[]{
                        Color.argb(58, 34, 211, 238),
                        Color.argb(34, 99, 102, 241),
                        Color.argb(0, 3, 9, 20)
                },
                new float[]{0f, 0.42f, 1f},
                Shader.TileMode.CLAMP
        ));
        canvas.drawCircle(w * 0.5f, h * 0.22f, Math.max(w, h) * 0.58f, halo);

        float stroke = Math.max(2f, w * 0.008f);
        float softStroke = Math.max(1f, w * 0.004f);

        arc.setStrokeWidth(stroke);
        arc.setShader(new LinearGradient(
                0, 0, w, h,
                new int[]{
                        Color.argb(215, 34, 211, 238),
                        Color.argb(205, 99, 102, 241),
                        Color.argb(195, 236, 72, 153)
                },
                null,
                Shader.TileMode.CLAMP
        ));

        softArc.setStrokeWidth(softStroke);
        softArc.setShader(new LinearGradient(
                w, 0, 0, h,
                new int[]{
                        Color.argb(75, 139, 92, 246),
                        Color.argb(55, 34, 211, 238),
                        Color.argb(70, 236, 72, 153)
                },
                null,
                Shader.TileMode.CLAMP
        ));

        float inset = w * 0.085f;
        RectF outer = new RectF(inset, inset, w - inset, h - inset);
        canvas.drawArc(outer, 205f, 54f, false, arc);
        canvas.drawArc(outer, 285f, 52f, false, arc);
        canvas.drawArc(outer, 28f, 38f, false, arc);

        float innerInset = w * 0.12f;
        RectF inner = new RectF(innerInset, innerInset, w - innerInset, h - innerInset);
        canvas.drawArc(inner, 198f, 40f, false, softArc);
        canvas.drawArc(inner, 310f, 44f, false, softArc);
    }
}
