package com.crewcheck.watch;

/** A scroll viewport whose corners remain inside the physical round display. */
final class WatchViewport {
    private WatchViewport() {}

    static int[] padding(int width, int height, boolean round) {
        int extent = Math.min(width, height);
        if (round) {
            // Inscribed square, with one physical pixel of clearance for rounding.
            int side = Math.max(0, (int) Math.floor(extent / Math.sqrt(2)) - 2);
            int horizontal = (int) Math.ceil((width - side) / 2.0);
            int vertical = (int) Math.ceil((height - side) / 2.0);
            return new int[]{horizontal, vertical, horizontal, vertical};
        }
        int horizontal = Math.round(extent * .06f);
        return new int[]{horizontal, Math.round(extent * .05f),
                horizontal, Math.round(extent * .10f)};
    }

    static boolean stack(int availableWidth, float density, float fontScale) {
        return availableWidth / density < 150 || fontScale > 1.2f;
    }
}
