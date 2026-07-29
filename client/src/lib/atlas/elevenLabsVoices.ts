/**
 * ATLAS-P0.7 — Resolução de vozes ElevenLabs por persona.
 *
 * Mantém Bruno e Daniel separados por variáveis de ambiente, com fallback
 * compatível para a voz padrão antiga.
 *
 * Contrato de segurança:
 *   - trocar Bruno NÃO altera Daniel;
 *   - ausência da voz específica usa o fallback;
 *   - nenhum ID aparece na interface comum;
 *   - somente a Central Admin pode testar e selecionar vozes;
 *   - logs registram a persona, mas não expõem a chave da API.
 *
 * Variáveis esperadas no Render:
 *   ELEVENLABS_VOICE_ID_BRUNO=pNZa0DWwl4bXevTwyjr0
 *   ELEVENLABS_VOICE_ID_DANIEL=<ID_ATUAL_DO_DANIEL>
 *   ELEVENLABS_VOICE_ID=<FALLBACK_ATUAL>
 */

export type VoicePersona = "bruno" | "daniel" | "default";

export interface VoiceEnvironment {
  ELEVENLABS_VOICE_ID_BRUNO?: string;
  ELEVENLABS_VOICE_ID_DANIEL?: string;
  ELEVENLABS_VOICE_ID?: string;
}

/**
 * Resolve o voice_id do ElevenLabs para a persona solicitada.
 *
 * Ordem recomendada de seleção:
 *   1. voz específica do personagem;
 *   2. voz padrão (fallback);
 *   3. erro de configuração ausente.
 */
export function resolveElevenLabsVoiceId(
  persona: VoicePersona,
  env: VoiceEnvironment = (typeof process !== "undefined" ? process.env : {}) as VoiceEnvironment,
): string {
  const specificVoice: string | undefined =
    persona === "bruno"
      ? env.ELEVENLABS_VOICE_ID_BRUNO
      : persona === "daniel"
        ? env.ELEVENLABS_VOICE_ID_DANIEL
        : env.ELEVENLABS_VOICE_ID;

  const voiceId = specificVoice || env.ELEVENLABS_VOICE_ID;

  if (!voiceId) {
    throw new Error("Nenhuma voz do ElevenLabs foi configurada.");
  }

  return voiceId;
}

/**
 * Resolve com fallback silencioso — útil quando o chamador prefere usar um
 * TTS alternativo autorizado em vez de falhar.
 */
export function resolveElevenLabsVoiceIdSafe(
  persona: VoicePersona,
  env: VoiceEnvironment = (typeof process !== "undefined" ? process.env : {}) as VoiceEnvironment,
): string | null {
  try {
    return resolveElevenLabsVoiceId(persona, env);
  } catch {
    return null;
  }
}

/**
 * Registra a persona selecionada para log, sem expor a chave da API.
 * Use isto no lugar de logar o voice_id diretamente.
 */
export function describeVoiceSelection(persona: VoicePersona): {
  persona: VoicePersona;
  hasVoiceId: boolean;
} {
  const env = (typeof process !== "undefined" ? process.env : {}) as VoiceEnvironment;
  const id = resolveElevenLabsVoiceIdSafe(persona, env);
  return { persona, hasVoiceId: Boolean(id) };
}
