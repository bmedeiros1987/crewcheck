package com.crewcheck.watch;

/** Stable phone-to-watch contract. The watch consumes canonical data and never parses rosters. */
public final class WatchContract {
    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_SNAPSHOT_BYTES = 16 * 1024;

    public static final String SNAPSHOT_PATH = "/crewcheck/watch/context/v1";
    public static final String REQUEST_SYNC_PATH = "/crewcheck/watch/request-sync/v1";
    public static final String DATA_KEY_SNAPSHOT_JSON = "snapshotJson";

    /**
     * Bem-estar e rotina viajam em canais PRÓPRIOS, nunca dentro do snapshot
     * operacional. Três razões:
     *
     *  1. o contrato operacional v1 já está assinado e em campo — subir o schema
     *     dele para acomodar saúde quebraria os relógios instalados;
     *  2. as cadências são diferentes: portão muda em minutos, recuperação muda
     *     algumas vezes ao dia, rotina uma vez por dia;
     *  3. LGPD: dado de saúde fica num canal separado, com guarda própria e
     *     podendo ser revogado sem derrubar a escala.
     */
    public static final int CREWLIFE_SCHEMA_VERSION = 2;
    public static final int ROUTINE_SCHEMA_VERSION = 1;

    /** Ambos são agregados derivados; 4 KiB é folgado e limita superfície. */
    public static final int MAX_WELLBEING_BYTES = 4 * 1024;

    public static final String CREWLIFE_V2_PATH = "/crewcheck/watch/crewlife/v2";
    public static final String CREWLIFE_CONTROL_PATH = CREWLIFE_V2_PATH + "/control";
    public static final String CREWLIFE_ACK_PATH = CREWLIFE_V2_PATH + "/ack";
    public static final String CREWLIFE_CAPABILITY = "crewlife_metric_validity_v2";
    /** Legacy path is deletion-only; values never regain validity. */
    public static final String CREWLIFE_PATH = "/crewcheck/watch/crewlife/v1";
    public static final String ROUTINE_PATH = "/crewcheck/watch/routine/v1";
    public static final String DATA_KEY_CREWLIFE_JSON = "crewLifeJson";
    public static final String DATA_KEY_ROUTINE_JSON = "routineJson";

    private WatchContract() {
    }
}
