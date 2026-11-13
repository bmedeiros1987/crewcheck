package lab.mcc;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/** Strict scripted HTTP peer. Binds only IPv4 loopback; never initiates a connection. */
final class LoopbackFixture implements AutoCloseable {
    static final String FORM_BODY = "fixture=synthetic";
    static final class Exchange {
        final String method, path, body, cookie, html, location, setCookie;
        final int status;
        final long delayMs;
        Exchange(String method, String path, String body, String cookie, int status,
                 String location, String setCookie, String html, long delayMs) {
            if (!path.matches("/[a-z0-9-]+") || (location != null && !location.matches("/[a-z0-9-]+")))
                throw new IllegalArgumentException("relative-fixture-path-required");
            this.method = method; this.path = path; this.body = body; this.cookie = cookie;
            this.status = status; this.location = location; this.setCookie = setCookie;
            this.html = html; this.delayMs = delayMs;
        }
    }
    private final ServerSocket server;
    private final Thread worker;
    private final ArrayDeque<Exchange> expected = new ArrayDeque<>();
    private final AtomicReference<Throwable> failure = new AtomicReference<>();
    private volatile boolean closing;
    private int received;
    private boolean inFlight;

    LoopbackFixture() throws IOException {
        server = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
        worker = new Thread(this::serve, "mcc-synthetic-loopback");
        worker.setDaemon(true); worker.start();
    }
    String origin() { return "http://127.0.0.1:" + server.getLocalPort(); }
    synchronized void expect(Exchange exchange) { expected.addLast(exchange); }
    synchronized int received() { return received; }
    synchronized void assertDrained() {
        if (failure.get() != null) throw new AssertionError("loopback-fixture-failed", failure.get());
        if (inFlight || !expected.isEmpty()) throw new AssertionError("loopback-exchange-missing");
    }
    synchronized void awaitDrained(long timeoutMs) throws InterruptedException {
        long deadline = System.nanoTime() + timeoutMs * 1000000;
        while ((inFlight || !expected.isEmpty()) && failure.get() == null) {
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) break;
            wait(Math.max(1, remaining / 1000000));
        }
        assertDrained();
    }
    Throwable failure() { return failure.get(); }
    private void serve() {
        while (!closing) {
            final Socket accepted;
            try { accepted = server.accept(); }
            catch (IOException error) {
                if (!closing) failure.compareAndSet(null, error);
                synchronized (this) { notifyAll(); }
                return;
            }
            synchronized (this) { inFlight = true; }
            try (Socket socket = accepted) {
                socket.setSoTimeout(5000);
                InputStream input = socket.getInputStream();
                String request = line(input);
                Map<String, String> headers = new HashMap<>();
                for (int count = 0; ; count++) {
                    if (count > 50) throw new IOException("too-many-headers");
                    String header = line(input);
                    if (header.isEmpty()) break;
                    int colon = header.indexOf(':');
                    if (colon < 1) throw new IOException("invalid-header");
                    String key = header.substring(0, colon).toLowerCase(java.util.Locale.ROOT);
                    if (headers.put(key, header.substring(colon + 1).trim()) != null)
                        throw new IOException("duplicate-header");
                }
                if (headers.containsKey("transfer-encoding")) throw new IOException("unexpected-transfer-encoding");
                int length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
                if (length < 0 || length > 256) throw new IOException("invalid-body-length");
                byte[] body = new byte[length];
                for (int offset = 0; offset < length;) {
                    int count = input.read(body, offset, length - offset);
                    if (count < 0) throw new EOFException();
                    offset += count;
                }
                Exchange exchange;
                synchronized (this) { exchange = expected.pollFirst(); }
                if (exchange == null) throw new AssertionError("unexpected-request");
                check((exchange.method + " " + exchange.path + " HTTP/1.1").equals(request), "method-or-path");
                check(exchange.body.equals(new String(body, StandardCharsets.US_ASCII)), "request-body");
                check(("127.0.0.1:" + server.getLocalPort()).equals(headers.get("host")), "host");
                check(exchange.cookie.equals(headers.getOrDefault("cookie", "")), "profile-cookie");
                if (exchange.delayMs > 0) Thread.sleep(exchange.delayMs);
                byte[] html = exchange.html.getBytes(StandardCharsets.UTF_8);
                String response = "HTTP/1.1 " + exchange.status + " Fixture\r\n"
                        + (exchange.location == null ? "" : "Location: " + exchange.location + "\r\n")
                        + (exchange.setCookie == null ? "" : "Set-Cookie: fixture=" + exchange.setCookie + "; Path=/; HttpOnly; SameSite=Lax\r\n")
                        + "Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\n"
                        + "Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; form-action 'self'; img-src data:; base-uri 'none'\r\n"
                        + "Content-Length: " + html.length + "\r\nConnection: close\r\n\r\n";
                socket.getOutputStream().write(response.getBytes(StandardCharsets.US_ASCII));
                socket.getOutputStream().write(html); socket.getOutputStream().flush();
                synchronized (this) { received++; inFlight = false; notifyAll(); }
            } catch (Throwable error) {
                failure.compareAndSet(null, error);
                synchronized (this) { notifyAll(); }
                return;
            }
        }
    }
    private static String line(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int previous = -1;
        while (bytes.size() <= 8192) {
            int current = input.read();
            if (current < 0) throw new EOFException();
            if (previous == '\r' && current == '\n') {
                byte[] all = bytes.toByteArray();
                return new String(all, 0, all.length - 1, StandardCharsets.US_ASCII);
            }
            bytes.write(current); previous = current;
        }
        throw new IOException("header-too-large");
    }
    private static void check(boolean value, String code) { if (!value) throw new AssertionError(code); }
    @Override public void close() throws IOException {
        closing = true; server.close();
        try { worker.join(6000); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        if (worker.isAlive()) throw new IOException("server-not-stopped");
    }
}
