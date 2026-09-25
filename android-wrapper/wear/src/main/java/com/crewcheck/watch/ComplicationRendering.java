package com.crewcheck.watch;

/**
 * Textos já resolvidos e truncados de uma complicação.
 *
 * Deliberadamente sem nenhuma dependência de Android: é o que permite testar a decisão de
 * texto de cada provider em JVM pura, sem emulador e sem SDK.
 */
final class ComplicationRendering {
    final String shortText;
    final String longText;
    final String title;
    final String description;

    /**
     * Valor 0–100 para o slot de anel (RANGED_VALUE), ou null quando não há medida.
     *
     * Null não é zero: sem medida a complicação de anel não é emitida, porque um anel
     * vazio desenhado a partir de silêncio é um dado de saúde inventado.
     */
    final Integer rangedValue;

    ComplicationRendering(String shortText, String longText, String title, String description) {
        this(shortText, longText, title, description, null);
    }

    ComplicationRendering(
            String shortText,
            String longText,
            String title,
            String description,
            Integer rangedValue
    ) {
        this.shortText = shortText;
        this.longText = longText;
        this.title = title;
        this.description = description;
        this.rangedValue = rangedValue;
    }
}
