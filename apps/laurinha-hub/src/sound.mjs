/**
 * Controle de som.
 *
 * Duas naturezas de saida convivem aqui, e a diferenca importa:
 *
 *  - TV: quem reproduz e a propria TV. O Hub nao chama o Home Assistant;
 *    ele devolve a URL do stream e mantem a fila. E o unico caminho por onde
 *    um MP3 da biblioteca local toca.
 *
 *  - Alexa/Echo: quem reproduz e o aparelho, via Home Assistant. O Hub manda
 *    o comando e le o estado de volta. MP3 local NAO passa por aqui: a Alexa
 *    nao reproduz arquivo local por media_player.play_media, entao o Hub
 *    recusa antes de tentar, com mensagem explicando a alternativa.
 */

import { ERRORS } from './errors.mjs';
import { isUnavailableState } from './haClient.mjs';

/** Servicos padrao do dominio media_player, validos para qualquer entidade. */
const DOMAIN_SERVICES = {
  play: 'media_play',
  pause: 'media_pause',
  stop: 'media_stop',
  next: 'media_next_track',
  previous: 'media_previous_track',
  volume: 'volume_set',
};

export const SOURCES = { LIBRARY: 'library', TUNEIN: 'tunein', MUSIC_ASSISTANT: 'music_assistant' };

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function createSoundService({ config, ha, library, logger = console, now = Date.now }) {
  /** Estado que pertence ao Hub (nao ao Home Assistant). */
  const hub = {
    outputId: config.defaultOutputId,
    queue: [],        // ids de faixa da biblioteca
    index: -1,
    intent: 'idle',   // playing | paused | idle  (usado quando a saida e a TV)
    volumePercent: 30,
    updatedAt: now(),
  };

  function findOutput(id) {
    const output = config.outputs.find((candidate) => candidate.id === id);
    if (!output) throw ERRORS.outputNotFound(id);
    return output;
  }

  function currentOutput() {
    return config.outputs.find((output) => output.id === hub.outputId) || config.outputs[0];
  }

  function publicUrlFor(kind, id) {
    if (!config.hub.publicBaseUrl) return null;
    return `${config.hub.publicBaseUrl}/api/media/${kind}/${encodeURIComponent(id)}`;
  }

  /**
   * Resolve qual chamada de HA representa uma acao.
   * Script configurado vence; sem script, o servico padrao do dominio.
   */
  function resolveCall(action, output, extraData = {}) {
    const override = config.soundScripts?.[action];
    if (override && (override.entityId || override.service)) {
      if (override.service) {
        const [domain, service] = String(override.service).split('.');
        if (!domain || !service) {
          throw ERRORS.badRequest(
            'Configuracao de script invalida.',
            `soundScripts.${action}.service deve ser "dominio.servico".`,
          );
        }
        return {
          domain,
          service,
          data: { ...(override.data || {}), ...extraData },
        };
      }
      // script.turn_on e o caminho seguro: nao precisa saber o nome do script
      // como servico, e aceita variaveis.
      const variables = { ...(override.variables || {}) };
      if (extraData.volume_level != null && override.variableName) {
        variables[override.variableName] = clampPercent(extraData.volume_level * 100);
      }
      if (output?.entityId && override.passEntity !== false) {
        variables.entity_id = output.entityId;
      }
      return {
        domain: 'script',
        service: 'turn_on',
        data: { entity_id: override.entityId, variables },
      };
    }

    if (!output?.entityId) {
      throw ERRORS.badRequest(
        'Essa saida nao aceita esse comando pelo Home Assistant.',
        'Saida sem entity_id (a TV toca localmente).',
      );
    }
    return {
      domain: 'media_player',
      service: DOMAIN_SERVICES[action],
      data: { entity_id: output.entityId, ...extraData },
    };
  }

  function queueTrack(index) {
    if (index < 0 || index >= hub.queue.length) return null;
    const track = library.findTrack(hub.queue[index]);
    if (!track) return null;
    return {
      id: track.id,
      title: track.title,
      url: publicUrlFor('track', track.id),
    };
  }

  function tvPlayback() {
    const track = queueTrack(hub.index);
    return {
      mode: 'tv_local',
      state: hub.intent,
      track,
      queueLength: hub.queue.length,
      queueIndex: hub.index,
    };
  }

  /** Lista as fontes utilizaveis agora, com motivo quando indisponivel. */
  async function describeSources(output) {
    const stats = library.stats();
    const sources = [
      {
        id: SOURCES.LIBRARY,
        label: 'Biblioteca da casa',
        available: output.supportsLocalMedia && stats.trackCount > 0,
        reason: !output.supportsLocalMedia
          ? `${output.label} nao reproduz MP3 da biblioteca local.`
          : stats.trackCount === 0
            ? (stats.error || 'Biblioteca vazia.')
            : null,
        trackCount: stats.trackCount,
      },
      {
        id: SOURCES.TUNEIN,
        label: 'Radio TuneIn',
        available: output.supportsTuneIn && config.tunein.length > 0,
        reason: !output.supportsTuneIn
          ? `${output.label} nao aceita radio por aqui.`
          : config.tunein.length === 0
            ? 'Nenhuma estacao TuneIn configurada.'
            : null,
        stations: config.tunein.map(({ id, label }) => ({ id, label })),
      },
    ];

    const maEntity = config.musicAssistant.entityId;
    let maAvailable = false;
    let maReason = 'Music Assistant nao configurado.';
    if (maEntity) {
      const probe = await ha.safe(() => ha.getState(maEntity));
      if (!probe.ok) {
        maReason = 'Nao consegui checar o Music Assistant agora.';
      } else if (!probe.value) {
        maReason = 'A entidade do Music Assistant nao existe no Home Assistant.';
      } else if (isUnavailableState(probe.value.state)) {
        maReason = 'Music Assistant esta indisponivel.';
      } else {
        maAvailable = true;
        maReason = null;
      }
    }
    sources.push({
      id: SOURCES.MUSIC_ASSISTANT,
      label: config.musicAssistant.label,
      available: maAvailable,
      reason: maReason,
    });

    return sources;
  }

  async function readState() {
    const output = currentOutput();
    const base = {
      ok: true,
      output: {
        id: output.id,
        label: output.label,
        kind: output.kind,
        entityId: output.entityId,
        supportsLocalMedia: output.supportsLocalMedia,
      },
      outputs: config.outputs.map((entry) => ({
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        supportsLocalMedia: entry.supportsLocalMedia,
      })),
      state: 'idle',
      title: null,
      artist: null,
      album: null,
      durationSeconds: null,
      positionSeconds: null,
      volumePercent: hub.volumePercent,
      muted: false,
      source: null,
      queue: { length: hub.queue.length, index: hub.index, owner: 'hub' },
      error: null,
      haReachable: config.ha.configured,
      updatedAt: new Date(now()).toISOString(),
    };

    // TV: o estado e do Hub, nao do Home Assistant.
    if (!output.entityId) {
      const playback = tvPlayback();
      return {
        ...base,
        state: hub.intent,
        title: playback.track?.title || null,
        source: playback.track ? SOURCES.LIBRARY : null,
        playback,
        haReachable: config.ha.configured,
      };
    }

    if (!config.ha.configured) {
      const error = ERRORS.hubNotConfigured();
      return { ...base, ok: false, state: 'unknown', haReachable: false, error: error.toJSON() };
    }

    const probe = await ha.safe(() => ha.getState(output.entityId));
    if (!probe.ok) {
      return {
        ...base,
        ok: false,
        state: 'unknown',
        haReachable: false,
        error: probe.error.toJSON(),
      };
    }
    if (!probe.value) {
      const error = ERRORS.entityNotFound(output.label);
      return { ...base, ok: false, state: 'unknown', error: error.toJSON() };
    }

    const entity = probe.value;
    const attributes = entity.attributes || {};
    const volumeLevel = Number(attributes.volume_level);

    return {
      ...base,
      state: isUnavailableState(entity.state) ? 'unavailable' : String(entity.state),
      title: attributes.media_title ?? null,
      artist: attributes.media_artist ?? null,
      album: attributes.media_album_name ?? null,
      durationSeconds: Number.isFinite(attributes.media_duration) ? attributes.media_duration : null,
      positionSeconds: Number.isFinite(attributes.media_position) ? attributes.media_position : null,
      volumePercent: Number.isFinite(volumeLevel) ? Math.round(volumeLevel * 100) : null,
      muted: attributes.is_volume_muted === true,
      source: attributes.media_content_type ? String(attributes.media_content_type) : null,
      queue: { length: null, index: null, owner: 'device' },
      error: isUnavailableState(entity.state)
        ? ERRORS.entityUnavailable(output.label).toJSON()
        : null,
    };
  }

  return {
    get hubState() {
      return { ...hub };
    },

    currentOutput,
    describeSources,
    state: readState,

    async setOutput(id) {
      const output = findOutput(id);
      hub.outputId = output.id;
      hub.updatedAt = now();
      // Trocar de saida nao transfere a reproducao em curso: quem estava
      // tocando continua tocando. Isso e documentado no README.
      return readState();
    },

    async play(payload = {}) {
      const output = payload.output ? findOutput(payload.output) : currentOutput();
      hub.outputId = output.id;

      const source = payload.source || (payload.trackId || payload.queue ? SOURCES.LIBRARY : null);

      // --- Biblioteca local -------------------------------------------------
      if (source === SOURCES.LIBRARY) {
        if (!output.supportsLocalMedia) {
          const alternatives = config.outputs
            .filter((entry) => entry.supportsLocalMedia)
            .map((entry) => ({ id: entry.id, label: entry.label }));
          throw ERRORS.outputCannotPlayLocal(output.label, alternatives);
        }

        const requested = Array.isArray(payload.queue) && payload.queue.length
          ? payload.queue.map(String)
          : payload.trackId
            ? [String(payload.trackId)]
            : null;

        if (requested) {
          const valid = requested.filter((id) => library.findTrack(id));
          if (!valid.length) throw ERRORS.mediaNotFound();
          hub.queue = valid;
          hub.index = 0;
        } else if (hub.index < 0 && hub.queue.length) {
          hub.index = 0;
        } else if (!hub.queue.length) {
          throw ERRORS.badRequest(
            'Escolha uma musica para tocar.',
            'Envie trackId ou queue no corpo da requisicao.',
          );
        }

        if (!config.hub.publicBaseUrl) {
          throw ERRORS.libraryUnavailable(
            'Defina LAURINHA_PUBLIC_BASE_URL para o Hub poder entregar o stream a TV.',
          );
        }

        hub.intent = 'playing';
        hub.updatedAt = now();
        return { ...(await readState()), playback: tvPlayback() };
      }

      // --- TuneIn -----------------------------------------------------------
      if (source === SOURCES.TUNEIN) {
        if (!output.supportsTuneIn) throw ERRORS.sourceUnavailable(SOURCES.TUNEIN);
        const station = config.tunein.find((entry) => entry.id === String(payload.stationId || ''));
        if (!station) {
          throw ERRORS.badRequest(
            'Essa radio nao esta configurada.',
            'Use um id presente em /api/sound/library (sources.tunein.stations).',
          );
        }
        await ha.requireAvailableEntity(output.entityId, output.label);
        await playMediaOrFail(output, station.contentId, station.contentType);
        return readState();
      }

      // --- Music Assistant --------------------------------------------------
      if (source === SOURCES.MUSIC_ASSISTANT) {
        const maEntity = config.musicAssistant.entityId;
        if (!maEntity) throw ERRORS.sourceUnavailable(SOURCES.MUSIC_ASSISTANT);
        if (!payload.mediaId) {
          throw ERRORS.badRequest(
            'Escolha o que tocar no Music Assistant.',
            'Envie mediaId (media_content_id do Music Assistant).',
          );
        }
        await ha.requireAvailableEntity(maEntity, config.musicAssistant.label);
        await playMediaOrFail(
          { ...output, entityId: maEntity, label: config.musicAssistant.label },
          String(payload.mediaId),
          String(payload.mediaType || 'music'),
        );
        return readState();
      }

      // --- Retomar o que estava tocando -------------------------------------
      if (!output.entityId) {
        if (!hub.queue.length) {
          throw ERRORS.badRequest(
            'Escolha uma musica para tocar.',
            'A fila da TV esta vazia.',
          );
        }
        hub.intent = 'playing';
        hub.updatedAt = now();
        return { ...(await readState()), playback: tvPlayback() };
      }

      await ha.requireAvailableEntity(output.entityId, output.label);
      const call = resolveCall('play', output);
      await ha.callService(call.domain, call.service, call.data);
      return readState();
    },

    async pause() {
      const output = currentOutput();
      if (!output.entityId) {
        hub.intent = 'paused';
        hub.updatedAt = now();
        return { ...(await readState()), playback: tvPlayback() };
      }
      await ha.requireAvailableEntity(output.entityId, output.label);
      const call = resolveCall('pause', output);
      await ha.callService(call.domain, call.service, call.data);
      return readState();
    },

    async stop() {
      const output = currentOutput();
      if (!output.entityId) {
        hub.intent = 'idle';
        hub.index = -1;
        hub.updatedAt = now();
        return { ...(await readState()), playback: tvPlayback() };
      }
      await ha.requireAvailableEntity(output.entityId, output.label);
      const call = resolveCall('stop', output);
      await ha.callService(call.domain, call.service, call.data);
      return readState();
    },

    async skip(direction) {
      const output = currentOutput();
      if (!output.entityId) {
        if (!hub.queue.length) {
          throw ERRORS.badRequest('Nao ha fila para avancar.', 'A fila da TV esta vazia.');
        }
        const step = direction === 'previous' ? -1 : 1;
        hub.index = (hub.index + step + hub.queue.length) % hub.queue.length;
        hub.intent = 'playing';
        hub.updatedAt = now();
        return { ...(await readState()), playback: tvPlayback() };
      }
      await ha.requireAvailableEntity(output.entityId, output.label);
      const call = resolveCall(direction === 'previous' ? 'previous' : 'next', output);
      await ha.callService(call.domain, call.service, call.data);
      return readState();
    },

    async setVolume(payload = {}) {
      const output = payload.output ? findOutput(payload.output) : currentOutput();
      hub.outputId = output.id;

      let target = clampPercent(payload.level);
      if (target == null && payload.delta != null) {
        const delta = Number(payload.delta);
        if (!Number.isFinite(delta)) {
          throw ERRORS.badRequest('Volume invalido.', 'delta precisa ser numero.');
        }
        const current = output.entityId ? (await readState()).volumePercent : hub.volumePercent;
        target = clampPercent((current ?? hub.volumePercent) + delta);
      }
      if (target == null) {
        throw ERRORS.badRequest(
          'Volume invalido.',
          'Envie level (0 a 100) ou delta (variacao em pontos).',
        );
      }

      if (!output.entityId) {
        hub.volumePercent = target;
        hub.updatedAt = now();
        return { ...(await readState()), playback: tvPlayback() };
      }

      await ha.requireAvailableEntity(output.entityId, output.label);
      const call = resolveCall('volume', output, { volume_level: target / 100 });
      await ha.callService(call.domain, call.service, call.data);
      hub.volumePercent = target;
      return readState();
    },

    async queue() {
      const output = currentOutput();
      if (output.entityId) {
        // A fila pertence ao aparelho (Alexa/MA). O Hub nao inventa conteudo.
        return {
          ok: true,
          owner: 'device',
          outputId: output.id,
          items: [],
          index: null,
          note: `A fila de ${output.label} e controlada pelo proprio aparelho.`,
        };
      }
      return {
        ok: true,
        owner: 'hub',
        outputId: output.id,
        index: hub.index,
        items: hub.queue.map((id, position) => {
          const track = library.findTrack(id);
          return {
            position,
            id,
            title: track?.title || null,
            url: track ? publicUrlFor('track', id) : null,
            current: position === hub.index,
          };
        }),
      };
    },

    async libraryView({ query, limit, offset } = {}) {
      const output = currentOutput();
      const page = library.searchTracks({ query, limit, offset });
      const snapshot = library.snapshot();
      return {
        ok: true,
        sources: await describeSources(output),
        tracks: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          items: page.items.map((track) => ({
            id: track.id,
            title: track.title,
            missing: track.missing,
            url: publicUrlFor('track', track.id),
          })),
        },
        playlists: snapshot.playlists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          trackCount: playlist.trackIds.length,
        })),
        photos: { total: snapshot.photos.length },
        albums: snapshot.albums.map((album) => ({
          id: album.id,
          name: album.name,
          photoCount: album.photoIds.length,
          intervalSeconds: album.intervalSeconds,
          coverUrl: album.coverId ? publicUrlFor('photo', album.coverId) : null,
        })),
        frameMode: snapshot.frameMode,
        libraryError: library.lastError,
      };
    },

    /** Usado pelo Modo Festa para ajustar som sem repetir logica. */
    async applyPartySound({ outputId, volume }) {
      if (outputId) await this.setOutput(outputId);
      if (volume != null) await this.setVolume({ level: volume });
      return readState();
    },
  };

  /**
   * play_media com tratamento de falha explicito.
   *
   * O Home Assistant responde 200 mesmo quando o aparelho ignora o conteudo,
   * entao o Hub confere o estado logo depois. Se a entidade nao saiu de
   * idle/unavailable, trata como recusa em vez de fingir sucesso.
   */
  async function playMediaOrFail(output, contentId, contentType) {
    try {
      await ha.callService('media_player', 'play_media', {
        entity_id: output.entityId,
        media_content_id: contentId,
        media_content_type: contentType,
      });
    } catch (error) {
      if (error?.code === 'ha_error') throw ERRORS.playMediaRejected(output.label);
      throw error;
    }

    const after = await ha.safe(() => ha.getState(output.entityId));
    if (after.ok && after.value && isUnavailableState(after.value.state)) {
      throw ERRORS.entityUnavailable(output.label);
    }
    return true;
  }
}
