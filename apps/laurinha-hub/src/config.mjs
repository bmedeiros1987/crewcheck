/**
 * Configuracao do Hub.
 *
 * Duas fontes, com papeis distintos:
 *
 *  - variaveis de ambiente  -> segredos e endereco (HA_TOKEN, HA_BASE_URL, ...)
 *  - arquivo JSON           -> identidades de entidades do Home Assistant
 *
 * Nenhum entity_id e inventado por este modulo. Os unicos IDs embutidos como
 * padrao sao os media_player que foram informados explicitamente para este
 * projeto; tudo o mais (scripts, cenas, luzes, clima, alarme) precisa vir do
 * arquivo de configuracao. Acao sem configuracao responde "nao configurado",
 * nunca um palpite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { registerSecretsFromEnv } from './redact.mjs';

/**
 * Saidas de audio informadas para este projeto.
 *
 * supportsLocalMedia = a saida consegue tocar um arquivo MP3 da biblioteca
 * local. So a propria TV consegue: ela busca o stream no Hub e reproduz
 * nativamente. Alexa/Echo NAO entra aqui - ver RISCOS.md.
 */
export const DEFAULT_OUTPUTS = [
  {
    id: 'tv',
    label: 'TV',
    kind: 'tv',
    entityId: null,
    supportsLocalMedia: true,
    supportsTuneIn: false,
    supportsMusicAssistant: false,
  },
  {
    id: 'todo_lugar',
    label: 'Todo lugar',
    kind: 'alexa_group',
    entityId: 'media_player.todo_lugar',
    supportsLocalMedia: false,
    supportsTuneIn: true,
    supportsMusicAssistant: false,
  },
  {
    id: 'echo_dot_de_bruno',
    label: 'Echo Dot do Bruno',
    kind: 'alexa',
    entityId: 'media_player.echo_dot_de_bruno',
    supportsLocalMedia: false,
    supportsTuneIn: true,
    supportsMusicAssistant: false,
  },
  {
    id: 'segundo_echo_dot_de_bruno',
    label: '2o Echo Dot do Bruno',
    kind: 'alexa',
    entityId: 'media_player.2o_echo_dot_de_bruno',
    supportsLocalMedia: false,
    supportsTuneIn: true,
    supportsMusicAssistant: false,
  },
  {
    id: 'echo_show_15_laurinha',
    label: 'Echo Show 15 da Laurinha',
    kind: 'alexa',
    entityId: 'media_player.echo_show_15_laurinha',
    supportsLocalMedia: false,
    supportsTuneIn: true,
    supportsMusicAssistant: false,
  },
  {
    id: 'echo_show_de_bruno',
    label: 'Echo Show do Bruno',
    kind: 'alexa',
    entityId: 'media_player.echo_show_de_bruno',
    supportsLocalMedia: false,
    supportsTuneIn: true,
    supportsMusicAssistant: false,
  },
];

/** Acoes de casa que a TV pode pedir. Todas exigem configuracao explicita. */
export const HOME_ACTIONS = ['lights', 'sound', 'party', 'good_night', 'climate', 'alarm'];

/**
 * Dominios de servico que o Hub aceita chamar no Home Assistant.
 *
 * Isto e um cinto de seguranca, nao uma conveniencia: mesmo que alguem
 * escreva uma configuracao errada, o Hub nao consegue chamar
 * `homeassistant.*`, `recorder.*`, `config.*` ou qualquer coisa capaz de
 * apagar entidade ou reescrever a configuracao do HA.
 */
export const ALLOWED_SERVICE_DOMAINS = new Set([
  'media_player',
  'script',
  'scene',
  'light',
  'switch',
  'climate',
  'alarm_control_panel',
  'input_boolean',
  'input_number',
  'select',
  'button',
]);

/** Servicos explicitamente proibidos mesmo dentro de um dominio liberado. */
export const FORBIDDEN_SERVICES = new Set([
  'script.reload',
  'scene.reload',
  'script.turn_off_all',
]);

function readNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * O arquivo de exemplo usa "TROCAR_" nos IDs que dependem da casa de cada um.
 * Copiar o exemplo sem editar e o erro mais facil de cometer, e o sintoma
 * seria um entity_not_found confuso la na frente. Melhor recusar subir agora,
 * dizendo exatamente quais chaves faltam trocar.
 */
export function findPlaceholders(value, trail = '', found = []) {
  if (typeof value === 'string') {
    if (value.includes('TROCAR')) found.push({ path: trail, value });
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findPlaceholders(entry, `${trail}[${index}]`, found));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key.startsWith('_')) continue; // blocos de comentario
      findPlaceholders(entry, trail ? `${trail}.${key}` : key, found);
    }
  }
  return found;
}

function readJsonFile(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Configuracao invalida em ${resolved}: ${error.message}`);
  }
}

function normalizeOutput(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`outputs[${index}] precisa ser um objeto.`);
  }
  const id = String(entry.id || '').trim();
  if (!id) throw new Error(`outputs[${index}].id e obrigatorio.`);
  const entityId = entry.entityId == null ? null : String(entry.entityId).trim() || null;
  if (entityId && !entityId.startsWith('media_player.')) {
    throw new Error(`outputs[${index}].entityId precisa ser um media_player.* (recebido: ${entityId}).`);
  }
  return {
    id,
    label: String(entry.label || id),
    kind: String(entry.kind || 'alexa'),
    entityId,
    supportsLocalMedia: entry.supportsLocalMedia === true,
    supportsTuneIn: entry.supportsTuneIn !== false && entry.kind !== 'tv',
    supportsMusicAssistant: entry.supportsMusicAssistant === true,
  };
}

/**
 * Le a configuracao. `env` e `fileSystem` sao injetaveis para teste.
 */
export function loadConfig(env = process.env, { readFile = readJsonFile } = {}) {
  registerSecretsFromEnv(env);

  let fileConfig = {};
  const configPath = env.LAURINHA_HUB_CONFIG;
  let configSource = null;
  if (configPath) {
    fileConfig = readFile(configPath);
    configSource = path.resolve(configPath);

    const placeholders = findPlaceholders(fileConfig);
    if (placeholders.length) {
      const list = placeholders.slice(0, 8).map((item) => `  ${item.path} = ${item.value}`).join('\n');
      const extra = placeholders.length > 8 ? `\n  ... e mais ${placeholders.length - 8}` : '';
      throw new Error(
        `A configuracao ainda tem placeholders do arquivo de exemplo.\n`
        + `Troque pelos IDs reais da sua casa (ou remova a chave para desativar a acao):\n`
        + `${list}${extra}`,
      );
    }
  }

  const outputsRaw = Array.isArray(fileConfig.outputs) && fileConfig.outputs.length
    ? fileConfig.outputs
    : DEFAULT_OUTPUTS;
  const outputs = outputsRaw.map(normalizeOutput);

  const seen = new Set();
  for (const output of outputs) {
    if (seen.has(output.id)) throw new Error(`outputs: id duplicado "${output.id}".`);
    seen.add(output.id);
  }

  const defaultOutputId = String(fileConfig.defaultOutput || env.LAURINHA_DEFAULT_OUTPUT || 'tv');
  if (!outputs.some((output) => output.id === defaultOutputId)) {
    throw new Error(`defaultOutput "${defaultOutputId}" nao existe na lista de outputs.`);
  }

  const haBaseUrl = String(env.HA_BASE_URL || '').trim().replace(/\/+$/, '');
  const haToken = String(env.HA_TOKEN || '').trim();

  return {
    hub: {
      host: String(env.LAURINHA_HUB_HOST || '0.0.0.0'),
      port: readNumber(env.LAURINHA_HUB_PORT, 8188, { min: 1, max: 65535 }),
      // Base publica que a TV usa para buscar stream/foto. Sem isso o Hub
      // ainda funciona, mas nao consegue montar URL de midia local.
      publicBaseUrl: String(env.LAURINHA_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
      bridgeKey: String(env.LAURINHA_BRIDGE_KEY || '').trim(),
      requireKeyForReads: env.LAURINHA_REQUIRE_KEY_FOR_READS === '1',
    },
    ha: {
      baseUrl: haBaseUrl,
      token: haToken,
      configured: Boolean(haBaseUrl && haToken),
      timeoutMs: readNumber(env.HA_TIMEOUT_MS, 5000, { min: 250, max: 60000 }),
      retries: readNumber(env.HA_RETRIES, 1, { min: 0, max: 3 }),
    },
    media: {
      root: String(env.LAURINHA_MEDIA_ROOT || '').trim(),
      manifestPath: String(env.LAURINHA_MANIFEST || '').trim(),
      musicDir: String(fileConfig.musicDir || 'MINHAS_MUSICAS'),
      photosDir: String(fileConfig.photosDir || 'FOTOS_LAURINHA'),
    },
    outputs,
    defaultOutputId,
    /**
     * Sobrescritas de servico. Quando o usuario tem scripts Laurinha proprios
     * (tocar/pausar/proxima/anterior/volume), eles entram aqui. Sem
     * configuracao o Hub usa os servicos padrao do dominio media_player, que
     * existem para qualquer media_player - isso nao e um ID inventado.
     */
    soundScripts: fileConfig.soundScripts && typeof fileConfig.soundScripts === 'object'
      ? fileConfig.soundScripts
      : {},
    /** Acoes de casa. Sem entrada aqui, a acao responde not_configured. */
    homeActions: fileConfig.homeActions && typeof fileConfig.homeActions === 'object'
      ? fileConfig.homeActions
      : {},
    /** Entidades so de leitura mostradas em /api/home/state. */
    homeSensors: Array.isArray(fileConfig.homeSensors) ? fileConfig.homeSensors.map(String) : [],
    musicAssistant: fileConfig.musicAssistant && typeof fileConfig.musicAssistant === 'object'
      ? {
        entityId: String(fileConfig.musicAssistant.entityId || '').trim() || null,
        label: String(fileConfig.musicAssistant.label || 'Music Assistant'),
      }
      : { entityId: null, label: 'Music Assistant' },
    tunein: Array.isArray(fileConfig.tunein)
      ? fileConfig.tunein.map((station) => ({
        id: String(station.id || '').trim(),
        label: String(station.label || station.id || ''),
        contentId: String(station.contentId || '').trim(),
        contentType: String(station.contentType || 'music'),
      })).filter((station) => station.id && station.contentId)
      : [],
    cors: {
      origins: String(env.LAURINHA_TV_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      // App empacotado no webOS envia Origin "null" ou "file://".
      allowPackagedApp: env.LAURINHA_ALLOW_PACKAGED_APP !== '0',
    },
    configSource,
  };
}
