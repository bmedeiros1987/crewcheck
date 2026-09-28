package com.crewcheck.watch;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Compact projection of the canonical CrewCheck roster.
 *
 * Presentation-only values live here. The watch never parses PDFs, reconstructs journeys,
 * calculates APZ, duty rules or compliance.
 */
public final class WatchContextSnapshot {
    private static final Set<String> STATES = Set.of(
            "OFF_DUTY",
            "LEAVE_SOON",
            "REPORTING",
            "BOARDING",
            "IN_FLIGHT",
            "CONNECTION",
            "OVERNIGHT",
            "CHANGED",
            "UNKNOWN"
    );

    public static final class ScheduleItem {
        public final String id;
        public final String kind;
        public final String time;
        public final String title;
        public final String route;
        public final String presentation;
        public final String gate;
        public final String detail;

        private ScheduleItem(
                String id,
                String kind,
                String time,
                String title,
                String route,
                String presentation,
                String gate,
                String detail
        ) {
            this.id = id;
            this.kind = kind;
            this.time = time;
            this.title = title;
            this.route = route;
            this.presentation = presentation;
            this.gate = gate;
            this.detail = detail;
        }

        static ScheduleItem fromJson(JSONObject json) {
            String kind = clean(json.optString("kind", "duty"), 12).toLowerCase(Locale.ROOT);
            if (!kind.equals("flight") && !kind.equals("stay") && !kind.equals("duty")) {
                kind = "duty";
            }
            return new ScheduleItem(
                    clean(json.optString("id", ""), 80),
                    kind,
                    clean(json.optString("time", ""), 12),
                    clean(json.optString("title", ""), 24),
                    clean(json.optString("route", ""), 32),
                    clean(json.optString("presentation", ""), 12),
                    clean(json.optString("gate", ""), 18),
                    clean(json.optString("detail", ""), 64)
            );
        }

        JSONObject toJson() throws JSONException {
            return new JSONObject()
                    .put("id", id)
                    .put("kind", kind)
                    .put("time", time)
                    .put("title", title)
                    .put("route", route)
                    .put("presentation", presentation)
                    .put("gate", gate)
                    .put("detail", detail);
        }
    }

    public final int schemaVersion;
    public final String contextId;
    public final long generatedAtEpochMs;
    public final long validUntilEpochMs;
    public final String state;
    public final String headline;
    public final String primaryTime;
    public final String detail;
    public final String presentationTime;
    public final String presentationPlace;
    public final String leaveTime;
    public final String trafficDetail;
    public final String currentFlight;
    public final String currentRoute;
    public final String gate;
    public final boolean remoteStand;
    public final String boardingTime;
    public final String eta;
    public final String connection;
    public final String nextFlight;
    public final String nextDetail;
    public final String overnight;
    public final String hotelPickup;
    public final boolean changed;
    public final String source;
    public final List<ScheduleItem> schedule;

    private WatchContextSnapshot(
            int schemaVersion,
            String contextId,
            long generatedAtEpochMs,
            long validUntilEpochMs,
            String state,
            String headline,
            String primaryTime,
            String detail,
            String presentationTime,
            String presentationPlace,
            String leaveTime,
            String trafficDetail,
            String currentFlight,
            String currentRoute,
            String gate,
            boolean remoteStand,
            String boardingTime,
            String eta,
            String connection,
            String nextFlight,
            String nextDetail,
            String overnight,
            String hotelPickup,
            boolean changed,
            String source,
            List<ScheduleItem> schedule
    ) {
        this.schemaVersion = schemaVersion;
        this.contextId = contextId;
        this.generatedAtEpochMs = generatedAtEpochMs;
        this.validUntilEpochMs = validUntilEpochMs;
        this.state = state;
        this.headline = headline;
        this.primaryTime = primaryTime;
        this.detail = detail;
        this.presentationTime = presentationTime;
        this.presentationPlace = presentationPlace;
        this.leaveTime = leaveTime;
        this.trafficDetail = trafficDetail;
        this.currentFlight = currentFlight;
        this.currentRoute = currentRoute;
        this.gate = gate;
        this.remoteStand = remoteStand;
        this.boardingTime = boardingTime;
        this.eta = eta;
        this.connection = connection;
        this.nextFlight = nextFlight;
        this.nextDetail = nextDetail;
        this.overnight = overnight;
        this.hotelPickup = hotelPickup;
        this.changed = changed;
        this.source = source;
        this.schedule = Collections.unmodifiableList(new ArrayList<>(schedule));
    }

    public static WatchContextSnapshot fromJson(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Snapshot vazio.");
        }
        if (raw.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_SNAPSHOT_BYTES) {
            throw new IllegalArgumentException("Snapshot excede 16 KiB.");
        }
        try {
            return fromJson(new JSONObject(raw));
        } catch (JSONException error) {
            throw new IllegalArgumentException("JSON de snapshot inválido.", error);
        }
    }

    public static WatchContextSnapshot fromJson(JSONObject json) {
        rejectSensitiveFields(json);

        int schemaVersion = json.optInt("schemaVersion", 0);
        if (schemaVersion != WatchContract.SCHEMA_VERSION) {
            throw new IllegalArgumentException("Versão de snapshot incompatível.");
        }

        long generatedAt = json.optLong("generatedAtEpochMs", 0L);
        if (generatedAt <= 0L) {
            throw new IllegalArgumentException("generatedAtEpochMs obrigatório.");
        }

        long validUntil = json.optLong("validUntilEpochMs", 0L);
        if (validUntil <= 0L) {
            throw new IllegalArgumentException("validUntilEpochMs obrigatório.");
        }
        if (validUntil < generatedAt) {
            throw new IllegalArgumentException("validUntilEpochMs anterior à geração.");
        }

        String state = clean(json.optString("state", "UNKNOWN"), 24).toUpperCase(Locale.ROOT);
        if (!STATES.contains(state)) state = "UNKNOWN";

        boolean remoteStand = json.optBoolean("remoteStand", false);
        String gate = clean(json.optString("gate", ""), 18);
        if ("REMOTA".equalsIgnoreCase(gate) || "REMOTE".equalsIgnoreCase(gate)) {
            remoteStand = true;
            gate = "";
        }

        boolean changed = json.optBoolean("changed", false) || "CHANGED".equals(state);
        String headline = clean(json.optString("headline", ""), 42);
        if (headline.isBlank()) {
            headline = defaultHeadline(state, remoteStand, changed);
        }

        List<ScheduleItem> schedule = new ArrayList<>();
        JSONArray scheduleArray = json.optJSONArray("schedule");
        if (scheduleArray != null) {
            int limit = Math.min(scheduleArray.length(), 8);
            for (int i = 0; i < limit; i++) {
                JSONObject item = scheduleArray.optJSONObject(i);
                if (item == null) continue;
                ScheduleItem parsed = ScheduleItem.fromJson(item);
                if (!parsed.title.isBlank() || !parsed.route.isBlank()) schedule.add(parsed);
            }
        }

        return new WatchContextSnapshot(
                schemaVersion,
                clean(json.optString("contextId", ""), 80),
                generatedAt,
                validUntil,
                state,
                headline,
                clean(json.optString("primaryTime", ""), 12),
                clean(json.optString("detail", ""), 96),
                clean(json.optString("presentationTime", ""), 12),
                clean(json.optString("presentationPlace", ""), 42),
                clean(json.optString("leaveTime", ""), 12),
                clean(json.optString("trafficDetail", ""), 64),
                clean(json.optString("currentFlight", ""), 16),
                clean(json.optString("currentRoute", ""), 32),
                gate,
                remoteStand,
                clean(json.optString("boardingTime", ""), 12),
                clean(json.optString("eta", ""), 12),
                clean(json.optString("connection", ""), 16),
                clean(json.optString("nextFlight", ""), 16),
                clean(json.optString("nextDetail", ""), 64),
                clean(json.optString("overnight", ""), 24),
                clean(json.optString("hotelPickup", ""), 64),
                changed,
                clean(json.optString("source", "canonical-roster"), 40),
                schedule
        );
    }

    public JSONObject toJson() {
        try {
            JSONObject json = new JSONObject()
                    .put("schemaVersion", schemaVersion)
                    .put("contextId", contextId)
                    .put("generatedAtEpochMs", generatedAtEpochMs)
                    .put("validUntilEpochMs", validUntilEpochMs)
                    .put("state", state)
                    .put("headline", headline)
                    .put("primaryTime", primaryTime)
                    .put("detail", detail)
                    .put("presentationTime", presentationTime)
                    .put("presentationPlace", presentationPlace)
                    .put("leaveTime", leaveTime)
                    .put("trafficDetail", trafficDetail)
                    .put("currentFlight", currentFlight)
                    .put("currentRoute", currentRoute)
                    .put("gate", gate)
                    .put("remoteStand", remoteStand)
                    .put("boardingTime", boardingTime)
                    .put("eta", eta)
                    .put("connection", connection)
                    .put("nextFlight", nextFlight)
                    .put("nextDetail", nextDetail)
                    .put("overnight", overnight)
                    .put("hotelPickup", hotelPickup)
                    .put("changed", changed)
                    .put("source", source);

            JSONArray items = new JSONArray();
            for (ScheduleItem item : schedule) items.put(item.toJson());
            json.put("schedule", items);
            return json;
        } catch (JSONException error) {
            throw new IllegalStateException("Não foi possível serializar o snapshot.", error);
        }
    }

    public boolean isStale(long nowEpochMs) {
        return nowEpochMs > validUntilEpochMs;
    }

    public String statusLabel(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "Dados antigos • abra o CrewCheck no celular";
        long minutes = Math.max(0L, (nowEpochMs - generatedAtEpochMs) / 60_000L);
        if (minutes < 1L) return "Atualizado agora";
        if (minutes == 1L) return "Atualizado há 1 min";
        if (minutes < 60L) return "Atualizado há " + minutes + " min";
        return "Atualizado há " + (minutes / 60L) + " h";
    }

    public String gateLabel() {
        if (remoteStand) return "REMOTA";
        if (!gate.isBlank()) return "PORTÃO " + gate;
        return "";
    }

    public String complicationShortText(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "ABRIR";
        if (changed) return "MUDOU";
        if (remoteStand) return "REMOTA";

        String normalized = headline.toUpperCase(Locale.ROOT);
        if (normalized.startsWith("SAIR EM ")) {
            String minutes = normalized.substring("SAIR EM ".length()).replaceAll("[^0-9]", "");
            if (!minutes.isBlank()) return truncate("SAIR" + minutes, 7);
        }
        if (!gate.isBlank()) return truncate("P" + gate.replaceAll("\s+", ""), 7);
        if (!currentFlight.isBlank()) return truncate(currentFlight, 7);
        if (!presentationTime.isBlank()) {
            return truncate("APZ" + presentationTime.replace(":", ""), 7);
        }
        return "CREW";
    }

    public String complicationTitle(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "CREWCHECK";
        return switch (state) {
            case "LEAVE_SOON" -> "SAÍDA";
            case "REPORTING" -> "APRESENTAÇÃO";
            case "BOARDING" -> "EMBARQUE";
            case "IN_FLIGHT" -> "VOO ATUAL";
            case "CONNECTION" -> "PRÓXIMO VOO";
            case "OVERNIGHT" -> "PERNOITE";
            case "CHANGED" -> "ALTERAÇÃO";
            default -> "CREWCHECK";
        };
    }

    public String complicationLongText(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "Abra o CrewCheck no celular";

        return truncate(switch (state) {
            case "LEAVE_SOON" -> {
                String value = !leaveTime.isBlank() ? "Sair " + leaveTime : headline;
                String apz = presentationTime.isBlank() ? "" : " • APZ " + presentationTime;
                yield value + apz;
            }
            case "REPORTING" -> "APZ " + firstNonBlank(presentationTime, primaryTime)
                    + (presentationPlace.isBlank() ? "" : " • " + presentationPlace);
            case "BOARDING" -> firstNonBlank(currentFlight, headline)
                    + (remoteStand ? " • REMOTA" : gate.isBlank() ? "" : " • P" + gate);
            case "IN_FLIGHT" -> firstNonBlank(currentFlight, headline)
                    + (currentRoute.isBlank() ? "" : " • " + currentRoute)
                    + (eta.isBlank() ? "" : " • ETA " + eta);
            case "CONNECTION" -> firstNonBlank(nextFlight, headline)
                    + (connection.isBlank() ? "" : " • " + connection);
            case "OVERNIGHT" -> firstNonBlank(overnight, headline)
                    + (hotelPickup.isBlank() ? "" : " • " + hotelPickup);
            default -> headline + (primaryTime.isBlank() ? "" : " • " + primaryTime);
        }, 48);
    }

    public String accessibilityDescription(long nowEpochMs) {
        StringBuilder value = new StringBuilder("CrewCheck. ");
        value.append(complicationLongText(nowEpochMs));
        if (!detail.isBlank()) value.append(". ").append(detail);
        return truncate(value.toString(), 120);
    }

    public static WatchContextSnapshot demo(long nowEpochMs) {
        try {
            JSONArray schedule = new JSONArray()
                    .put(new JSONObject()
                            .put("id", "demo-flight-1")
                            .put("kind", "flight")
                            .put("time", "13:45")
                            .put("title", "LA3721")
                            .put("route", "BSB → GRU")
                            .put("presentation", "13:30")
                            .put("gate", "24")
                            .put("detail", "Embarque 13:45"))
                    .put(new JSONObject()
                            .put("id", "demo-flight-2")
                            .put("kind", "flight")
                            .put("time", "16:30")
                            .put("title", "LA3102")
                            .put("route", "GRU → GYN")
                            .put("presentation", "16:05")
                            .put("gate", "18")
                            .put("detail", "Próxima perna"))
                    .put(new JSONObject()
                            .put("id", "demo-stay")
                            .put("kind", "stay")
                            .put("time", "19:00")
                            .put("title", "Pernoite")
                            .put("route", "GYN")
                            .put("detail", "Hotel confirmado"));

            return fromJson(new JSONObject()
                    .put("schemaVersion", 1)
                    .put("contextId", "debug-demo")
                    .put("generatedAtEpochMs", nowEpochMs)
                    .put("validUntilEpochMs", nowEpochMs + 3_600_000L)
                    .put("state", "LEAVE_SOON")
                    .put("headline", "SAIR EM 18 MIN")
                    .put("primaryTime", "12:42")
                    .put("detail", "APZ 13:30 • BSB")
                    .put("presentationTime", "13:30")
                    .put("presentationPlace", "BSB")
                    .put("leaveTime", "12:42")
                    .put("trafficDetail", "38 min • trânsito normal")
                    .put("currentFlight", "LA3721")
                    .put("currentRoute", "BSB → GRU")
                    .put("gate", "24")
                    .put("remoteStand", false)
                    .put("boardingTime", "13:45")
                    .put("eta", "15:10")
                    .put("connection", "")
                    .put("nextFlight", "LA3102")
                    .put("nextDetail", "GRU → GYN • Portão 18")
                    .put("overnight", "GYN")
                    .put("hotelPickup", "Pickup 20:00")
                    .put("changed", false)
                    .put("source", "debug-demo")
                    .put("schedule", schedule));
        } catch (JSONException error) {
            throw new IllegalStateException("Não foi possível criar o snapshot de demonstração.", error);
        }
    }

    private static void rejectSensitiveFields(JSONObject json) {
        String[] prohibited = {
                "cpf", "email", "phone", "crewName", "hotelRoom", "roomNumber",
                "token", "accessToken", "refreshToken", "authorization"
        };
        for (String key : prohibited) {
            if (json.has(key)) {
                throw new IllegalArgumentException("Campo pessoal não permitido no relógio: " + key);
            }
        }
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private static String defaultHeadline(String state, boolean remoteStand, boolean changed) {
        if (changed) return "ESCALA ALTERADA";
        if (remoteStand) return "EMBARQUE REMOTO";
        return switch (state) {
            case "OFF_DUTY" -> "SEM ATIVIDADE";
            case "LEAVE_SOON" -> "HORA DE SAIR";
            case "REPORTING" -> "APRESENTAÇÃO";
            case "BOARDING" -> "EMBARQUE";
            case "IN_FLIGHT" -> "VOO EM ANDAMENTO";
            case "CONNECTION" -> "CONEXÃO";
            case "OVERNIGHT" -> "PERNOITE";
            default -> "PRÓXIMO PASSO";
        };
    }

    private static String clean(String value, int maxLength) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return truncate(normalized, maxLength);
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value == null ? "" : value;
        return value.substring(0, maxLength);
    }
}
