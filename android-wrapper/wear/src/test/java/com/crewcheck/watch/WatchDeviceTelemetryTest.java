package com.crewcheck.watch;

import org.junit.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;

public final class WatchDeviceTelemetryTest {
    @Test
    public void validOpaqueNonceIsEchoedExactly() {
        String nonce = "req-ABC_123:xyz";
        assertEquals(
                nonce,
                WatchDeviceTelemetry.parseRequestId(nonce.getBytes(StandardCharsets.UTF_8))
        );
    }

    @Test
    public void whitespaceInsideNonceIsNotRewritten() {
        String nonce = "req  ABC  123";
        assertEquals(
                nonce,
                WatchDeviceTelemetry.parseRequestId(nonce.getBytes(StandardCharsets.UTF_8))
        );
    }

    @Test
    public void unicodeLimitCountsCodePointsNotUtf16Units() {
        String sixtyFourEmoji = "✈️".repeat(32);
        assertEquals(
                sixtyFourEmoji,
                WatchDeviceTelemetry.parseRequestId(sixtyFourEmoji.getBytes(StandardCharsets.UTF_8))
        );
    }

    @Test
    public void malformedUtf8FallsBackToLegacyUnverified() {
        byte[] malformed = new byte[]{(byte) 0xC3, (byte) 0x28};
        assertEquals("", WatchDeviceTelemetry.parseRequestId(malformed));
    }

    @Test
    public void invalidOrOversizedNonceFallsBackToLegacyUnverified() {
        assertEquals("", WatchDeviceTelemetry.parseRequestId(null));
        assertEquals("", WatchDeviceTelemetry.parseRequestId(new byte[0]));
        assertEquals(
                "",
                WatchDeviceTelemetry.parseRequestId("bad\nnonce".getBytes(StandardCharsets.UTF_8))
        );
        assertEquals(
                "",
                WatchDeviceTelemetry.parseRequestId("x".repeat(65).getBytes(StandardCharsets.UTF_8))
        );
        assertEquals(
                "",
                WatchDeviceTelemetry.parseRequestId("😀".repeat(65).getBytes(StandardCharsets.UTF_8))
        );
    }
}
