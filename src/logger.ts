import log, { LogLevelDesc } from 'loglevel';

const logLevel = process.env.LOG_LEVEL || 'info';

const logger = log.getLogger('ic-websocket-js');
logger.setDefaultLevel(logLevel as LogLevelDesc);

export { logger };
