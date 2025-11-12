import { logger } from './logger';
import { network } from './network';
import { chainManager } from './chain';
import { mempool } from './mempool';
import { objectManager } from './object';

const BIND_PORT = 18018;
const BIND_IP = '0.0.0.0';

async function main() {
  // await chainManager.init()
  // await mempool.init()
  objectManager.dump().then((objs) => {
    logger.info(`Database contains %d objects`, objs.size);
    for (const [id, obj] of objs) {
      logger.info(`Object ID: ${id}, Object: %o`, obj);
    }
  });
  network.init(BIND_PORT, BIND_IP);
}

main();
