package lab.mcc;

import android.app.Instrumentation;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Isolated browser-mechanics test. Does not exercise CrewCheck route policy. */
public final class RedirectInstrumentation extends Instrumentation {
  private WebView view;
  private final List<String> seen = Collections.synchronizedList(new ArrayList<>());
  private final CountDownLatch returned = new CountDownLatch(1);
  private volatile Throwable serverFailure;
  @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    ServerSocket server = null;
    try {
      server = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
      server.setSoTimeout(20000);
      final ServerSocket listener = server;
      Thread worker = new Thread(() -> {
        try {
          for (int i = 0; i < 3; i++) {
            try (Socket socket = listener.accept()) {
              socket.setSoTimeout(10000);
              BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
              String request = input.readLine();
              int length = 0; String cookie = ""; String line;
              while ((line = input.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.substring(15).trim());
                if (line.toLowerCase(Locale.ROOT).startsWith("cookie:")) cookie = line.substring(7).trim();
              }
              if (length > 128) throw new AssertionError("oversized fixture");
              char[] body = new char[length]; int count = 0;
              while (count < length) { int n = input.read(body, count, length-count); if(n < 0) throw new EOFException(); count += n; }
              String expected = new String[]{"GET /start HTTP/1.1", "POST /acs HTTP/1.1", "GET /return HTTP/1.1"}[i];
              if (!expected.equals(request)) throw new AssertionError("wrong request sequence at " + i);
              if (i > 0 && !cookie.contains("fixture=synthetic")) throw new AssertionError("browser context lost");
              if (i == 1 && !"fixture=synthetic".equals(new String(body))) throw new AssertionError("POST body lost");
              if (i == 2 && length != 0) throw new AssertionError("redirect GET retained body");
              seen.add(new String[]{"GET start", "POST acs + fixture body", "GET return + same cookie"}[i]);
              String html = i == 0 ? "<html><head><link rel='icon' href='data:,'></head><body><form method='POST' action='/acs'><input name='fixture' value='synthetic'></form><script>document.forms[0].submit()</script></body></html>" : "<html>synthetic complete</html>";
              byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
              String headers = "HTTP/1.1 " + (i == 1 ? "302 Found\r\nLocation: /return\r\n" : "200 OK\r\n") + (i == 0 ? "Set-Cookie: fixture=synthetic; Path=/; HttpOnly; SameSite=Lax\r\n" : "") + "Content-Type: text/html; charset=utf-8\r\nContent-Length: " + bytes.length + "\r\nConnection: close\r\n\r\n";
              socket.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));
              socket.getOutputStream().write(bytes); socket.getOutputStream().flush();
            }
          }
        } catch (Throwable failure) { serverFailure = failure; returned.countDown(); }
      }, "synthetic-loopback-server");
      worker.setDaemon(true); worker.start();
      final String startUrl = "http://127.0.0.1:" + server.getLocalPort() + "/start";
      runOnMainSync(() -> {
        view = new WebView(getTargetContext());
        CookieManager.getInstance().setAcceptCookie(true);
        view.getSettings().setJavaScriptEnabled(true);
        view.setWebViewClient(new WebViewClient() {
          @Override public void onPageFinished(WebView web, String url) {
            if (url.equals(startUrl.replace("/start", "/return"))) returned.countDown();
          }
        });
        view.loadUrl(startUrl); // Only initial GET. Browser owns the form POST and redirect.
      });
      if (!returned.await(25, TimeUnit.SECONDS)) throw new AssertionError("WebView timeout");
      worker.join(1000);
      if (serverFailure != null) throw new AssertionError("fixture server failed", serverFailure);
      if (seen.size() != 3) throw new AssertionError("incomplete browser chain");
      CountDownLatch clean = new CountDownLatch(1);
      runOnMainSync(() -> CookieManager.getInstance().removeAllCookies(ok -> clean.countDown()));
      if (!clean.await(5, TimeUnit.SECONDS)) throw new AssertionError("cookie cleanup timeout");
      runOnMainSync(() -> {
        if (CookieManager.getInstance().getCookie(startUrl) != null) throw new AssertionError("cookie survived cleanup");
      });
      result.putString("result", "PASS: real WebView POST body, 302 GET, cookie continuity, cookie cleanup");
      finish(-1, result);
    } catch (Throwable failure) {
      result.putString("result", "FAIL: " + failure.getClass().getSimpleName());
      finish(0, result);
    } finally {
      if (server != null) try { server.close(); } catch (IOException ignored) {}
      runOnMainSync(() -> { if (view != null) { view.stopLoading(); view.destroy(); } CookieManager.getInstance().removeAllCookies(null); });
    }
  }
}
