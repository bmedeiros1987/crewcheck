package com.crewcheck.watch;

import org.junit.Test;
import static org.junit.Assert.*;

public class WatchViewportTest {
    @Test public void allViewportCornersStayInsideSmallRoundScreens() {
        for (int size : new int[]{160, 192, 200, 227, 320, 360, 390, 450}) {
            int[] p = WatchViewport.padding(size, size, true);
            double radius = size / 2.0;
            for (int x : new int[]{p[0], size - p[2]}) {
                for (int y : new int[]{p[1], size - p[3]}) {
                    assertTrue("corner outside circle at " + size,
                            Math.hypot(x - radius, y - radius) < radius);
                }
            }
            assertTrue(size - p[0] - p[2] > size * .68);
        }
    }

    @Test public void rectangularWindowCentersSafeSquareInSmallerDimension() {
        int[] p = WatchViewport.padding(390, 360, true);
        assertEquals(390 - p[0] - p[2], 360 - p[1] - p[3]);
    }

    @Test public void smallScreensAndLargeFontsStackWithoutShrinkingText() {
        assertTrue(WatchViewport.stack(136, 1f, 1f));
        assertTrue(WatchViewport.stack(300, 2f, 1.3f));
        assertTrue(WatchViewport.stack(320, 2f, 1.5f));
        assertFalse(WatchViewport.stack(320, 2f, 1f));
    }

    @Test public void squareDisplayDoesNotLoseRoundScreenCorners() {
        int[] p = WatchViewport.padding(200, 200, false);
        assertArrayEquals(new int[]{12, 10, 12, 20}, p);
    }
}
