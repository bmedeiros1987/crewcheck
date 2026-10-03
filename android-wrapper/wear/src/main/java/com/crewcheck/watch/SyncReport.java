package com.crewcheck.watch;

/**
 * Resultado de um pedido de sincronização, com um status por canal — em JVM pura.
 *
 * A escala e o CrewLife chegam por caminhos diferentes e o celular pode enviar um sem o
 * outro. "Sincronizado agora" da escala não diz nada sobre saúde; por isso o CrewLife tem
 * status próprio, e só é confirmado quando um resumo novo e vigente de fato chegou.
 */
final class SyncReport {

    enum Phone {
        /** Pelo menos um nó conectado recebeu o pedido. */
        CONNECTED,
        /** Nenhum nó conectado: o pedido não saiu do relógio. */
        NOT_CONNECTED,
        /** Falha do Data Layer ao localizar o celular. */
        ERROR
    }

    final Phone phone;
    final DataItemTriage.Decision roster;
    final DataItemTriage.Decision crewLife;

    SyncReport(Phone phone, DataItemTriage.Decision roster, DataItemTriage.Decision crewLife) {
        this.phone = phone;
        this.roster = roster;
        this.crewLife = crewLife;
    }

    /** Um resumo CrewLife novo e dentro da validade chegou neste pedido. */
    boolean crewLifeConfirmed() {
        return crewLife != null
                && crewLife.outcome == DataItemTriage.Outcome.FRESH
                && !crewLife.stale;
    }

    private boolean rosterAvailable() {
        return roster != null && roster.accepted();
    }

    String operationalStatus() {
        if (phone == Phone.NOT_CONNECTED) {
            return rosterAvailable()
                    ? "Celular offline · dados anteriores mantidos"
                    : "Celular não conectado";
        }
        if (phone == Phone.ERROR) {
            return rosterAvailable()
                    ? "Não foi possível falar com o celular · dados anteriores mantidos"
                    : "Não foi possível localizar o celular";
        }
        if (roster != null && roster.outcome == DataItemTriage.Outcome.FRESH) {
            return "Sincronizado agora";
        }
        return rosterAvailable()
                ? "Celular não respondeu · usando última atualização"
                : "CrewCheck do celular não respondeu";
    }

    /**
     * Status do CrewLife, sem nunca afirmar consentimento negado: o relógio não sabe disso.
     * Ausência de resumo pode ser revogação, CrewLife desligado ou celular sem enviar.
     */
    String crewLifeStatus() {
        if (crewLifeConfirmed()) return "CrewLife atualizado agora";

        DataItemTriage.Outcome outcome = crewLife == null
                ? DataItemTriage.Outcome.ABSENT
                : crewLife.outcome;

        if (outcome == DataItemTriage.Outcome.INVALID) {
            return "Resumo CrewLife recebido é inválido e foi ignorado";
        }
        if (crewLife != null && crewLife.accepted() && crewLife.stale) {
            return "Último resumo CrewLife está desatualizado";
        }
        if (outcome == DataItemTriage.Outcome.RESTORED || outcome == DataItemTriage.Outcome.UNCHANGED) {
            return phone == Phone.CONNECTED
                    ? "Celular não enviou resumo novo · mantido o último"
                    : "Celular fora de alcance · mantido o último resumo";
        }
        if (phone == Phone.NOT_CONNECTED) return "Celular não conectado · sem resumo CrewLife";
        if (phone == Phone.ERROR) return "Não foi possível falar com o celular";
        return "Celular não enviou resumo CrewLife · abra o CrewLife no celular";
    }
}
