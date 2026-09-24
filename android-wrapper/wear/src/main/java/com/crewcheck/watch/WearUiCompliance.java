package com.crewcheck.watch;

import android.graphics.drawable.Drawable;
import android.graphics.drawable.InsetDrawable;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.TextView;

/**
 * Presentation-only guardrail for the native CrewWatch hierarchy.
 *
 * It keeps typography and interactive bounds inside Wear OS quality guidance
 * without changing navigation, data, parsing, sync, entitlement or business state.
 * The guard is intentionally idempotent because MainActivity rebuilds its view
 * hierarchy whenever the canonical snapshot changes.
 */
final class WearUiCompliance {
    static final float MIN_SECONDARY_SP = 10f;
    static final float MIN_ESSENTIAL_SP = 12f;
    static final int MIN_TOUCH_DP = 48;

    private int lastHierarchySignature;

    void applyIfNeeded(View anchor) {
        if (anchor == null) return;
        View root = anchor.getRootView();
        if (!(root instanceof ViewGroup)) return;

        int before = hierarchySignature(root);
        if (before == lastHierarchySignature) return;

        enforce(root);
        lastHierarchySignature = hierarchySignature(root);
    }

    private void enforce(View view) {
        if (view instanceof TextView) {
            enforceTypography((TextView) view);
        }

        if (view.isClickable() && view.isEnabled() && view.getVisibility() == View.VISIBLE) {
            enforceTouchTarget(view);
        }

        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                enforce(group.getChildAt(index));
            }
        }
    }

    private void enforceTypography(TextView view) {
        float scaledDensity = view.getResources().getDisplayMetrics().scaledDensity;
        if (scaledDensity <= 0f) return;

        float currentSp = view.getTextSize() / scaledDensity;
        boolean essential = view.isClickable()
                || (view.getTypeface() != null && view.getTypeface().isBold());
        float minimumSp = essential ? MIN_ESSENTIAL_SP : MIN_SECONDARY_SP;

        if (currentSp + 0.01f < minimumSp) {
            view.setTextSize(TypedValue.COMPLEX_UNIT_SP, minimumSp);
        }
    }

    private void enforceTouchTarget(View view) {
        int minimumPx = dp(view, MIN_TOUCH_DP);
        ViewGroup.LayoutParams params = view.getLayoutParams();

        if (params != null) {
            int originalWidth = params.width;
            int originalHeight = params.height;
            boolean expandWidth = originalWidth > 0 && originalWidth < minimumPx;
            boolean expandHeight = originalHeight > 0 && originalHeight < minimumPx;

            if ((expandWidth || expandHeight) && view.getBackground() != null
                    && !(view.getBackground() instanceof InsetDrawable)) {
                int horizontalInset = expandWidth ? Math.max(0, (minimumPx - originalWidth) / 2) : 0;
                int verticalInset = expandHeight ? Math.max(0, (minimumPx - originalHeight) / 2) : 0;
                Drawable visual = view.getBackground();
                view.setBackground(new InsetDrawable(
                        visual,
                        horizontalInset,
                        verticalInset,
                        horizontalInset,
                        verticalInset
                ));
            }

            if (expandWidth) params.width = minimumPx;
            if (expandHeight) params.height = minimumPx;
            if (expandWidth || expandHeight) view.setLayoutParams(params);
        }

        view.setMinimumWidth(minimumPx);
        view.setMinimumHeight(minimumPx);
        ensureParentHeight(view, minimumPx);
    }

    private void ensureParentHeight(View view, int minimumPx) {
        ViewParent parentRef = view.getParent();
        if (!(parentRef instanceof ViewGroup)) return;

        ViewGroup parent = (ViewGroup) parentRef;
        parent.setMinimumHeight(minimumPx);

        ViewGroup.LayoutParams parentParams = parent.getLayoutParams();
        if (parentParams != null && parentParams.height > 0 && parentParams.height < minimumPx) {
            parentParams.height = minimumPx;
            parent.setLayoutParams(parentParams);
        }
    }

    private int hierarchySignature(View view) {
        int result = System.identityHashCode(view);
        result = 31 * result + view.getWidth();
        result = 31 * result + view.getHeight();
        result = 31 * result + (view.isClickable() ? 1 : 0);

        if (view instanceof TextView) {
            TextView text = (TextView) view;
            result = 31 * result + Float.floatToIntBits(text.getTextSize());
        }

        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            result = 31 * result + group.getChildCount();
            for (int index = 0; index < group.getChildCount(); index++) {
                result = 31 * result + hierarchySignature(group.getChildAt(index));
            }
        }
        return result;
    }

    private static int dp(View view, int value) {
        return Math.round(value * view.getResources().getDisplayMetrics().density);
    }
}
