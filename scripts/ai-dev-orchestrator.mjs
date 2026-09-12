#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { AiDevOrchestrator } from '../server/ai/dev-orchestrator.mjs';
import { aiGatewayConfigFromEnv } from '../server/ai/gateway.mjs';
import { providersFromEnv } from '../server/ai/providers.mjs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm run ai:dev:review -- <sanitized-input.json>');
  process.exitCode = 2;
} else {
  try {
    const input = JSON.parse(await readFile(path, 'utf8'));
    const config = aiGatewayConfigFromEnv(process.env);
    const providers = providersFromEnv(process.env).map((provider) => ({
      ...provider,
      enabled: !config.killSwitch && provider.enabled && config.providerFlags[provider.id] === true && (provider.tier !== 'strong' || config.allowPaid === true),
    }));
    const orchestrator = new AiDevOrchestrator({ providers, timeoutMs: Number(process.env.AI_DEV_TIMEOUT_MS || 30_000) });
    const report = await orchestrator.analyze(input);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.providers.completed.length === 0) process.exitCode = 1;
  } catch (error) {
    console.error(`[ai-dev-orchestrator] blocked: ${error.code || error.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
