/*
 * Cliente do Laurinha Connected Hub para a TV LG.
 *
 * Compativel com webOS 4.x (Chromium 53). Por isso, de proposito:
 *   - script classico, sem `import`/`export` (modulos ES so no Chrome 61+);
 *   - sem async/await (Chrome 55+);
 *   - sem Object.entries/Object.values (Chrome 54+);
 *   - XMLHttpRequest em vez de fetch, que e mais previsivel em app
 *     empacotado com origem file://.
 *
 * Uso:
 *   LaurinhaHub.configure({ baseUrl: 'http://192.168.0.32:8188', key: '...' });
 *   LaurinhaHub.soundState().then(render, showError);
 *
 * Este arquivo NAO toca em layout nem CSS: ele so busca dados e devolve
 * objetos prontos para a tela existente consumir.
 */
(function (global) {
  'use strict';

  var config = {
    baseUrl: '',
    key: '',
    timeoutMs: 8000
  };

  /* Mensagem que a TV pode mostrar direto, por codigo de erro do Hub. */
  var FALLBACK_MESSAGES = {
    network: 'Nao consegui falar com o Hub da casa.',
    timeout: 'O Hub demorou para responder.',
    parse: 'O Hub respondeu algo que eu nao entendi.',
    unknown: 'Algo deu errado.'
  };

  function buildUrl(path, query) {
    var url = config.baseUrl + path;
    if (!query) return url;
    var parts = [];
    for (var key in query) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
      if (query[key] === undefined || query[key] === null || query[key] === '') continue;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
    }
    if (!parts.length) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&');
  }

  /* Normaliza qualquer falha em { code, message, hint } para a UI. */
  function toError(code, message, hint, status) {
    return {
      code: code || 'unknown',
      message: message || FALLBACK_MESSAGES[code] || FALLBACK_MESSAGES.unknown,
      hint: hint || null,
      status: status || 0
    };
  }

  function request(method, path, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      if (!config.baseUrl) {
        reject(toError('not_configured', 'O endereco do Hub ainda nao foi configurado na TV.'));
        return;
      }

      var xhr = new XMLHttpRequest();
      var finished = false;

      function fail(error) {
        if (finished) return;
        finished = true;
        reject(error);
      }

      xhr.open(method, buildUrl(path, options.query), true);
      xhr.timeout = options.timeoutMs || config.timeoutMs;
      if (config.key) xhr.setRequestHeader('X-Laurinha-Key', config.key);
      if (options.body) xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.onload = function () {
        if (finished) return;
        finished = true;
        var payload = null;
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (e) {
          reject(toError('parse', FALLBACK_MESSAGES.parse, null, xhr.status));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
          return;
        }
        var error = payload && payload.error ? payload.error : null;
        reject(toError(
          error ? error.code : 'http_' + xhr.status,
          error ? error.message : FALLBACK_MESSAGES.unknown,
          error ? error.hint : null,
          xhr.status
        ));
      };

      xhr.onerror = function () { fail(toError('network', FALLBACK_MESSAGES.network)); };
      xhr.ontimeout = function () { fail(toError('timeout', FALLBACK_MESSAGES.timeout)); };
      xhr.onabort = function () { fail(toError('aborted', 'Pedido cancelado.')); };

      try {
        xhr.send(options.body ? JSON.stringify(options.body) : null);
      } catch (e) {
        fail(toError('network', FALLBACK_MESSAGES.network));
      }
    });
  }

  function get(path, query) { return request('GET', path, { query: query }); }
  function post(path, body) { return request('POST', path, { body: body || {} }); }

  /*
   * Reduz o estado do Hub ao que a tela precisa. A TV nao deveria ter que
   * saber a forma interna da resposta nem montar texto de erro.
   */
  function viewModel(state) {
    if (!state) return null;
    return {
      title: state.title || (state.playback && state.playback.track ? state.playback.track.title : null),
      artist: state.artist || null,
      state: state.state || 'unknown',
      playing: state.state === 'playing',
      volumePercent: state.volumePercent === null || state.volumePercent === undefined
        ? null : state.volumePercent,
      outputId: state.output ? state.output.id : null,
      outputLabel: state.output ? state.output.label : null,
      outputs: state.outputs || [],
      /* URL presente = a TV deve reproduzir o arquivo ela mesma. */
      localUrl: state.playback && state.playback.track ? state.playback.track.url : null,
      errorMessage: state.error ? state.error.message : null,
      degraded: state.ok === false
    };
  }

  var api = {
    configure: function (options) {
      options = options || {};
      if (options.baseUrl) config.baseUrl = String(options.baseUrl).replace(/\/+$/, '');
      if (options.key !== undefined) config.key = String(options.key || '');
      if (options.timeoutMs) config.timeoutMs = options.timeoutMs;
      return api;
    },

    health: function () { return get('/health'); },

    /* ---- Som ---- */
    soundState: function () { return get('/api/sound/state'); },
    view: function () { return api.soundState().then(viewModel); },
    play: function (payload) { return post('/api/sound/play', payload); },
    pause: function () { return post('/api/sound/pause'); },
    stop: function () { return post('/api/sound/stop'); },
    next: function () { return post('/api/sound/next'); },
    previous: function () { return post('/api/sound/previous'); },
    volume: function (payload) { return post('/api/sound/volume', payload); },
    setOutput: function (outputId) { return post('/api/sound/output', { output: outputId }); },
    library: function (query) { return get('/api/sound/library', query); },
    queue: function () { return get('/api/sound/queue'); },

    /* ---- Casa ---- */
    homeState: function () { return get('/api/home/state'); },
    homeAction: function (action, params) {
      return post('/api/home/action', { action: action, params: params || {} });
    },

    /* Atalhos das acoes pedidas pela TV. */
    lights: function (params) { return api.homeAction('lights', params); },
    sound: function (params) { return api.homeAction('sound', params); },
    party: function (params) { return api.homeAction('party', params); },
    goodNight: function (params) { return api.homeAction('good_night', params); },
    climate: function (params) { return api.homeAction('climate', params); },
    alarm: function (params) { return api.homeAction('alarm', params); },

    toViewModel: viewModel,

    /*
     * Polling simples para manter a tela viva sem WebSocket (que o Chromium
     * 53 aguenta, mas que complica reconexao na TV). Devolve stop().
     */
    pollSoundState: function (onState, onError, intervalMs) {
      var timer = null;
      var stopped = false;
      var interval = intervalMs || 5000;

      function tick() {
        if (stopped) return;
        api.soundState().then(function (state) {
          if (!stopped && onState) onState(viewModel(state), state);
        }, function (error) {
          if (!stopped && onError) onError(error);
        }).then(function () {
          if (!stopped) timer = global.setTimeout(tick, interval);
        });
      }

      tick();
      return function stop() {
        stopped = true;
        if (timer) global.clearTimeout(timer);
      };
    }
  };

  global.LaurinhaHub = api;
}(typeof window !== 'undefined' ? window : this));
