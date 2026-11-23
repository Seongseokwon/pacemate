import { loadConfig } from './config.js';
import { initMonitoring } from './monitoring.js';

initMonitoring(loadConfig().SENTRY_DSN);
