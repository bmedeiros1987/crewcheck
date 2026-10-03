/**
 * Ponto de entrada do Laurinha Connected Hub.
 *
 * Nao imprime segredo nenhum no boot: so diz se cada coisa esta configurada.
 */

import http from 'node:http';
import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';
import { createLogger } from './redact.mjs';

const logger = createLogger();

let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error('[hub] configuracao invalida:', error.message);
  process.exit(1);
}

const { handler } = createApp({ config, logger });
const server = http.createServer(handler);

server.listen(config.hub.port, config.hub.host, () => {
  logger.info(`[hub] Laurinha Connected Hub ouvindo em ${config.hub.host}:${config.hub.port}`);
  logger.info(`[hub] Home Assistant configurado: ${config.ha.configured ? 'sim' : 'nao'}`);
  logger.info(`[hub] bridge key configurada: ${config.hub.bridgeKey ? 'sim' : 'nao'}`);
  logger.info(`[hub] acoes de casa configuradas: ${Object.keys(config.homeActions).join(', ') || 'nenhuma'}`);
  if (config.configSource) logger.info(`[hub] configuracao lida de ${config.configSource}`);
});

const shutdown = (signal) => {
  logger.info(`[hub] recebendo ${signal}, encerrando.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
