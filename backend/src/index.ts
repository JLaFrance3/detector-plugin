// Entry point: reads configuration from the environment and starts the service.
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createSightengine } from './sightengine.js';

const config = loadConfig();
const app = buildApp({
  provider: config.sightengine ? createSightengine(config.sightengine) : null,
  dailyCap: config.dailyCap,
  trustProxy: config.trustProxy,
  logger: true,
});

if (!config.sightengine) {
  app.log.warn('No Sightengine credentials set; POST /v1/check will answer 503.');
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'could not start');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
