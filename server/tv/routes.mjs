import { TvError } from "./devices.mjs";

// Host injects established account auth, atomic device store, rate limiting,
// and account-bound canonical projection loader. No fallback to browser identity.
export function createTvHandler({
  enabled = false,
  devices,
  authenticateAccount,
  loadProjection,
  news,
  rateLimit,
}) {
  return async function handle({ method, path, token, body = {}, ip }) {
    if (!enabled) return { status: 404, body: { error: "unavailable" } };
    try {
      if (!(await rateLimit(ip, path))) throw new TvError(429, "rate_limited");
      if (method === "POST" && path === "/api/tv/pair")
        return { status: 200, body: await devices.begin(body.platform, body.trusted === true) };
      if (method === "POST" && path === "/api/tv/poll")
        return { status: 200, body: await devices.poll(body.deviceCode) };
      if (
        ["/api/tv/approve", "/api/tv/revoke", "/api/tv/devices", "/api/tv/preferences", "/api/tv/context", "/api/tv/trust"].includes(path)
      ) {
        const userId = await authenticateAccount(token);
        if (!userId) throw new TvError(401, "authentication_required");
        if (path.endsWith("/devices") && method === "GET")
          return { status: 200, body: await devices.list(userId) };
        if (path.endsWith("/approve") && method === "POST")
          return {
            status: 200,
            body: await devices.approve(userId, body.userCode, body.privacy),
          };
        if (path.endsWith("/revoke") && method === "POST")
          return {
            status: 200,
            body: await devices.revoke(userId, body.deviceId),
          };
        if (path.endsWith("/preferences") && method === "POST")
          return {
            status: 200,
            body: await devices.updatePreferences(userId, body.deviceId, body.preferences),
          };
        if (path.endsWith("/context") && method === "POST")
          return {
            status: 200,
            body: await devices.updateContext(userId, body.deviceId, body.context),
          };
        if (path.endsWith("/trust") && method === "POST")
          return {
            status: 200,
            body: await devices.updateTrust(userId, body.deviceId, body.trusted),
          };
        throw new TvError(405, "method_not_allowed");
      }
      const auth = await devices.authorize(token);
      if (path === "/api/tv/logout" && method === "POST")
        return {
          status: 200,
          body: await devices.revoke(auth.userId, auth.deviceId),
        };
      if (path === "/api/tv/heartbeat" && method === "POST")
        return { status: 200, body: await devices.heartbeat(token) };
      if (path === "/api/tv/snapshot" && method === "GET") {
        const snapshot = await loadProjection(auth);
        const expectedPrivacy = auth.preferences?.audience && auth.preferences.audience !== "owner" ? "family" : auth.privacy;
        if (
          !snapshot ||
          snapshot.deviceId !== auth.deviceId ||
          snapshot.privacy !== expectedPrivacy
        )
          throw new TvError(503, "projection_unavailable");
        return { status: 200, body: snapshot };
      }
      if (path === "/api/tv/news" && method === "GET")
        return { status: 200, body: await news(auth) };
      throw new TvError(404, "not_found");
    } catch (e) {
      return {
        status: e instanceof TvError ? e.status : 503,
        body: {
          error: e instanceof TvError ? e.message : "temporarily_unavailable",
        },
      };
    }
  };
}
