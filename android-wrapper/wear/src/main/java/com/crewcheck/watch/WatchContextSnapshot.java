package com.crewcheck.watch;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * Compact projection of the canonical CrewCheck roster.
 *
 * This class validates presentation-ready fields only. It deliberately contains no PDF parsing,
 * journey reconstruction, APZ calculation, duty-time calculation or regulatory decision logic.
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
            String source
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
    }

    public static WatchContextSnapshot fromJson(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Snapshot vazio.");
        }
        if (raw.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_SNAPSHOT_BYTES) {
            throw new IllegalArgumentException("Snapshot excede 16 KiB.");
        }
        return fromJson(new JSONObject(raw));
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
                clean(json.optString("source", "canonical-roster"), 40)
        );
    }

    public JSONObject toJson() {
        return new JSONObject()
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
        if (!gate.isBlank()) return truncate("P" + gate.replaceAll("\\s+", ""), 7);
        if (!currentFlight.isBlank()) return truncate(currentFlight, 7);
        if (!presentationTime.isBlank()) {
            return truncate("APZ" + presentationTime.replace(":", ""), 7);
        }
        return "CREW";
    }

    public String complicationLongText(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "Abra o CrewCheck no celular";
        StringBuilder text = new StringBuilder(headline);
        if (!primaryTime.isBlank()) text.append(" • ").append(primaryTime);
        if (remoteStand) text.append(" • REMOTA");
        else if (!gate.isBlank()) text.append(" • Portão ").append(gate);
        return truncate(text.toString(), 48);
    }

    public String accessibilityDescription(long nowEpochMs) {
        StringBuilder value = new StringBuilder("CrewCheck. ");
        value.append(complicationLongText(nowEpochMs));
        if (!detail.isBlank()) value.append(". ").append(detail);
        return truncate(value.toString(), 120);
    }

    public static WatchContextSnapshot demo(long nowEpochMs) {
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
                .put("nextFlight", "")
                .put("nextDetail", "")
                .put("overnight", "")
                .put("hotelPickup", "")
                .put("changed", false)
                .put("source", "debug-demo"));
    }

    private static void rejectSensitiveFields(JSONObject json) {
        String[] prohibited = {"cpf", "email", "phone", "crewName", "hotelRoom", "roomNumber"};
        for (String key : prohibited) {
            if (json.has(key)) {
                throw new IllegalArgumentException("Campo pessoal não permitido no relógio: " + key);
            }
        }
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
        String normalized = value.replaceAll("[\\p{Cntrl}&&[^\n\t]]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return truncate(normalized, maxLength);
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value == null ? "" : value;
        return value.substring(0, maxLength);
    }
}
