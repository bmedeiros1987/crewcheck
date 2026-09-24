package com.crewcheck.watch;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

/**
 * Lightweight decorative layer for CrewWatch.
 *
 * The backdrop is intentionally static and allocation-free while drawing: it adds
 * depth around the circular safe area without competing with the operational
 * information or keeping the display active with decorative animation.
 */
public final class PremiumBackdropView extends View {
    // Wear OS quality WO-V13: preserve a true black activity background.
    // CrewCheck identity is carried by the restrained accent glows and cards.
    private static final int BASE = Color.BLACK;

    private final Paint focusGlow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint lowerGlow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint edgeVignette = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint accentArc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint quietArc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bezel = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final RectF outerArc = new RectF();
    private final RectF innerArc = new RectF();
    private final RectF bezelOval = new RectF();

    private float width;
    private float height;
    private float focusRadius;
    private float lowerRadius;
    private float vignetteRadius;

    public PremiumBackdropView(Context context) {
        super(context);

        accentArc.setStyle(Paint.Style.STROKE);
        accentArc.setStrokeCap(Paint.Cap.ROUND);

        quietArc.setStyle(Paint.Style.STROKE);
        quietArc.setStrokeCap(Paint.Cap.ROUND);

        bezel.setStyle(Paint.Style.STROKE);
        bezel.setStrokeCap(Paint.Cap.ROUND);

        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        setFocusable(false);
        setClickable(false);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (w <= 0 || h <= 0) return;

        width = w;
        height = h;
        float max = Math.max(width, height);
        float min = Math.min(width, height);

        focusRadius = max * 0.72f;
        lowerRadius = max * 0.42f;
        vignetteRadius = max * 0.72f;

        focusGlow.setShader(new RadialGradient(
                width * 0.50f,
                height * 0.30f,
                focusRadius,
                new int[]{
                        Color.argb(46, 34, 211, 238),
                        Color.argb(26, 99, 102, 241),
                        Color.argb(10, 139, 92, 246),
                        Color.argb(0, 3, 8, 20)
                },
                new float[]{0f, 0.32f, 0.62f, 1f},
                Shader.TileMode.CLAMP
        ));

        lowerGlow.setShader(new RadialGradient(
                width * 0.72f,
                height * 0.82f,
                lowerRadius,
                new int[]{
                        Color.argb(18, 236, 72, 153),
                        Color.argb(10, 139, 92, 246),
                        Color.argb(0, 3, 8, 20)
                },
                new float[]{0f, 0.48f, 1f},
                Shader.TileMode.CLAMP
        ));

        edgeVignette.setShader(new RadialGradient(
                width * 0.50f,
                height * 0.50f,
                vignetteRadius,
                new int[]{
                        Color.argb(0, 0, 0, 0),
                        Color.argb(12, 0, 0, 0),
                        Color.argb(104, 0, 0, 0),
                        Color.argb(170, 0, 0, 0)
                },
                new float[]{0f, 0.58f, 0.86f, 1f},
                Shader.TileMode.CLAMP
        ));

        accentArc.setStrokeWidth(Math.max(2f, min * 0.0075f));
        accentArc.setShader(new LinearGradient(
                0f,
                height * 0.12f,
                width,
                height * 0.88f,
                new int[]{
                        Color.argb(126, 34, 211, 238),
                        Color.argb(98, 99, 102, 241),
                        Color.argb(76, 236, 72, 153)
                },
                null,
                Shader.TileMode.CLAMP
        ));

        quietArc.setStrokeWidth(Math.max(1f, min * 0.0038f));
        quietArc.setShader(new LinearGradient(
                width,
                0f,
                0f,
                height,
                new int[]{
                        Color.argb(48, 139, 92, 246),
                        Color.argb(38, 34, 211, 238),
                        Color.argb(30, 236, 72, 153)
                },
                null,
                Shader.TileMode.CLAMP
        ));

        bezel.setStrokeWidth(Math.max(1f, min * 0.0025f));
        bezel.setColor(Color.argb(40, 148, 163, 184));

        float outerInset = min * 0.055f;
        outerArc.set(
                (width - min) * 0.5f + outerInset,
                (height - min) * 0.5f + outerInset,
                (width + min) * 0.5f - outerInset,
                (height + min) * 0.5f - outerInset
        );

        float innerInset = min * 0.083f;
        innerArc.set(
                (width - min) * 0.5f + innerInset,
                (height - min) * 0.5f + innerInset,
                (width + min) * 0.5f - innerInset,
                (height + min) * 0.5f - innerInset
        );

        float bezelInset = min * 0.026f;
        bezelOval.set(
                (width - min) * 0.5f + bezelInset,
                (height - min) * 0.5f + bezelInset,
                (width + min) * 0.5f - bezelInset,
                (height + min) * 0.5f - bezelInset
        );
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (width <= 0f || height <= 0f) return;

        canvas.drawColor(BASE);

        // Calm center first: operational copy stays on the quietest part of the canvas.
        canvas.drawCircle(width * 0.50f, height * 0.30f, focusRadius, focusGlow);
        canvas.drawCircle(width * 0.72f, height * 0.82f, lowerRadius, lowerGlow);

        // Instrument-like accents live near the bezel, never behind the primary copy.
        canvas.drawArc(outerArc, 204f, 36f, false, accentArc);
        canvas.drawArc(outerArc, 302f, 29f, false, accentArc);
        canvas.drawArc(innerArc, 222f, 24f, false, quietArc);
        canvas.drawArc(innerArc, 319f, 22f, false, quietArc);

        // The vignette protects contrast near the circular edge and visually contains scrolling.
        canvas.drawCircle(width * 0.50f, height * 0.50f, vignetteRadius, edgeVignette);
        canvas.drawOval(bezelOval, bezel);
    }
}
