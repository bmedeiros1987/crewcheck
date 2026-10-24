package lab.mcc;

import java.io.ByteArrayOutputStream;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/** JVM tests of the actual lab helpers; this is NOT Android/WebView instrumentation. */
public final class LabHostHarness {
    private static int checks;
    public static void main(String[] ignored) throws Exception {
        LabTerminalGate gate = new LabTerminalGate(100);
        check(!gate.publish(0), "no evidence");
        gate.browserComplete(1);
        check(!gate.publish(2), "no cleanup");
        gate.cleanupComplete(3, true);
        check(gate.publish(4), "complete and cleared");
        check(!gate.publish(5), "one publication");
        gate.cancel(); gate.fail(); gate.cleanupComplete(6, false);
        check(gate.state() == LabTerminalGate.State.PASSED, "terminal immutable");
        for (int order = 0; order < 3; order++) {
            LabTerminalGate cancelled = new LabTerminalGate(100);
            if (order == 0) cancelled.browserComplete(1);
            if (order == 1) cancelled.cleanupComplete(1, true);
            cancelled.cancel(); cancelled.cancel();
            cancelled.browserComplete(2); cancelled.cleanupComplete(2, true);
            check(!cancelled.publish(3) && cancelled.state() == LabTerminalGate.State.CANCELLED, "cancel plus late callbacks");
        }
        LabTerminalGate timeout = new LabTerminalGate(10);
        timeout.browserComplete(10); timeout.cleanupComplete(11, true);
        check(!timeout.publish(11) && timeout.state() == LabTerminalGate.State.TIMED_OUT, "deadline inclusive");
        LabTerminalGate lateCleanup = new LabTerminalGate(10);
        lateCleanup.browserComplete(1); lateCleanup.cleanupComplete(10, true);
        check(!lateCleanup.publish(10), "cleanup after timeout");
        LabTerminalGate latePublish = new LabTerminalGate(10);
        latePublish.browserComplete(1); latePublish.cleanupComplete(2, true);
        check(!latePublish.publish(10), "publication after timeout");
        LabTerminalGate failure = new LabTerminalGate(100);
        failure.browserComplete(1); failure.cleanupComplete(2, false); failure.cleanupComplete(3, true);
        check(!failure.publish(4) && failure.state() == LabTerminalGate.State.FAILED, "failed cleanup stays failed");
        for (int code : new int[]{302, 307, 308}) {
            try (LoopbackFixture fixture = new LoopbackFixture()) {
                fixture.expect(new LoopbackFixture.Exchange("POST", "/acs", LoopbackFixture.FORM_BODY, "fixture=A", code, "/return", null, "synthetic", 0));
                String response = send(fixture, "POST", "/acs", LoopbackFixture.FORM_BODY, "fixture=A");
                fixture.awaitDrained(1000);
                check(response.startsWith("HTTP/1.1 " + code + " ") && response.contains("Location: /return\r\n"), "redirect fixture response");
                String method = code == 302 ? "GET" : "POST";
                String body = code == 302 ? "" : LoopbackFixture.FORM_BODY;
                fixture.expect(new LoopbackFixture.Exchange(method, "/return", body, "fixture=A", 200, null, null, "synthetic", 0));
                check(send(fixture, method, "/return", body, "fixture=A").startsWith("HTTP/1.1 200 "), "fixture receipt");
                fixture.awaitDrained(1000); check(fixture.received() == 2, "receipt count");
            }
        }
        reject("GET", "/probe", "wrong", "fixture=A", "request-body");
        reject("GET", "/probe", "", "fixture=B", "profile-cookie");
        reject("POST", "/probe", "", "fixture=A", "method-or-path");
        reject("GET", "/different", "", "fixture=A", "method-or-path");
        System.out.println("PASS " + checks + " JVM helper assertions; Android/Profile browser execution NOT performed");
    }
    private static void reject(String method, String path, String body, String cookie, String expected) throws Exception {
        try (LoopbackFixture fixture = new LoopbackFixture()) {
            fixture.expect(new LoopbackFixture.Exchange("GET", "/probe", "", "fixture=A", 200, null, null, "synthetic", 0));
            send(fixture, method, path, body, cookie);
            boolean rejected = false;
            try { fixture.awaitDrained(1000); } catch (AssertionError error) {
                rejected = error.getCause() != null && expected.equals(error.getCause().getMessage());
            }
            check(rejected, "fixture detects " + expected);
        }
    }
    private static String send(LoopbackFixture fixture, String method, String path, String body, String cookie) throws Exception {
        URI origin = URI.create(fixture.origin());
        try (Socket socket = new Socket(origin.getHost(), origin.getPort())) {
            socket.setSoTimeout(2000);
            String request = method + " " + path + " HTTP/1.1\r\nHost: " + origin.getAuthority()
                + "\r\nContent-Length: " + body.length() + "\r\n"
                + (cookie.isEmpty() ? "" : "Cookie: " + cookie + "\r\n") + "Connection: close\r\n\r\n" + body;
            socket.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII)); socket.getOutputStream().flush();
            ByteArrayOutputStream response = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024]; int count;
            while ((count = socket.getInputStream().read(buffer)) != -1) response.write(buffer, 0, count);
            return response.toString("US-ASCII");
        }
    }
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}
