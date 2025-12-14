import { logger } from './logger';
import { network } from './network';
import { chainManager } from './chain';
import { mempool } from './mempool';
import { objectManager } from './object';

const BIND_IP = '0.0.0.0';
const DEFAULT_PORT = 18018;

function parsePort(): number {
  const args = process.argv.slice(2);
  const portIndex = args.findIndex((arg) => arg === '-p' || arg === '--port');

  if (portIndex !== -1 && args[portIndex + 1]) {
    const port = parseInt(args[portIndex + 1], 10);
    if (!isNaN(port) && port >= 1 && port <= 65535) {
      return port;
    }
    logger.error('Invalid port number. Using default port %d', DEFAULT_PORT);
  }

  return DEFAULT_PORT;
}

async function main() {
  const port = parsePort();
  logger.info('Starting server on port %d', port);

  // await chainManager.init()
  // await mempool.init()
  objectManager.dump().then((objs) => {
    logger.info(`Database contains %d objects`, objs.size);
    for (const [id, obj] of objs) {
      logger.info(`Object ID: ${id}, Object: %o`, obj);
    }
  });
  await network.init(port, BIND_IP);
}

main();
