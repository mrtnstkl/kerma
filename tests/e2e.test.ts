import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { ChildProcess, spawn } from 'child_process';
import { MessageSocket } from '../src/network';

const DEFAULT_HOST = 'localhost:18018';
const BLOCK_HOST = 'localhost:18019';
const BLOCK_HOST_INCORRECT = 'localhost:18020';

const tmpBase = os.tmpdir();

let processes: Array<ChildProcess> = [];
let temporaryDirectories: Array<string> = [];

class SocketWithBuffers {
  socket: MessageSocket;
  receivedMessages: Array<string> = [];
  receivedError: Boolean = false;

  static async create(host: string = DEFAULT_HOST) {
    const socket = await MessageSocket.createClient(host);
    return new SocketWithBuffers(socket);
  }

  constructor(socket: MessageSocket) {
    this.socket = socket;

    this.socket.on('message', (message: string) => {
      this.receivedMessages.push(message);
    });

    this.socket.on('error', () => {
      this.receivedError = true;
    });
  }

  sendMessage(message: string) {
    this.socket.sendMessage(message);
  }

  close() {
    this.socket.end();
  }

  /*
   * Check if receivedMessages array contains an error message. If error name
   * is specified, it will only consider error messages with this name.
   */
  receivedErrorMessage(name?: string) {
    for (const message of this.receivedMessages) {
      try {
        const parsedMessage = JSON.parse(message);

        if (
          parsedMessage['type'] === 'error' &&
          (name === undefined || parsedMessage['name'] === name)
        ) {
          return true;
        }
      } catch {}
    }

    return false;
  }
}

const startNode = (port?: number) => {
  const databaseDirectory = fs.mkdtempSync(path.join(tmpBase, 'kerma-'));

  const portArguments = port === undefined ? [] : ['--', '--port', port.toString()];

  const proc = spawn('npm', [...['run', 'start'], ...portArguments], {
    env: { ...process.env, OBJECT_DATABASE_DIRECTORY: databaseDirectory, NO_BOOTSTRAP_PEERS: '1' },
    stdio: 'inherit',
    shell: true,
  });

  processes.push(proc);
  temporaryDirectories.push(databaseDirectory);
};

beforeAll(async () => {
  startNode(); // For testing transactions
  startNode(18019); // For testing blocks
  startNode(18020); // For testing incorrect blocks
  startNode(18021); // For testing incorrect blocks

  await new Promise((res) => setTimeout(res, 3000));
});

afterAll(() => {
  // Kill all spawned processes
  processes.forEach((proc) => {
    proc.kill('SIGTERM');
  });
  processes = [];

  // Clean up temporary directories
  temporaryDirectories.forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  temporaryDirectories = [];
});

test('connects and sends initial messages', async () => {
  const peer = await SocketWithBuffers.create();

  await new Promise((res) => setTimeout(res, 1000));

  expect(peer.receivedError).toBe(false);
  expect(peer.receivedMessages).toContain('{"type":"hello","version":"0.10.0","agent":"b0b3r"}');
  expect(peer.receivedMessages).toContain('{"type":"getpeers"}');

  peer.close();
});

test('fails on invalid hello message', async () => {
  const invalidMessagees = [
    '{"type":"hello","version":"brah","agent":"test"}',
    '{"type":"hello","agent":"test"}',
    '{"type":"hello"}',
  ];

  for (const message of invalidMessagees) {
    const peer = await SocketWithBuffers.create();

    peer.sendMessage(message);

    await new Promise((res) => setTimeout(res, 1000));

    expect(peer.receivedErrorMessage('INVALID_HANDSHAKE')).toBeTruthy();
  }
});

test('fails on no hello message', async () => {
  const peer = await SocketWithBuffers.create();

  await new Promise((res) => setTimeout(res, 21000)); // Wait for over 20 seconds

  expect(peer.receivedErrorMessage('INVALID_HANDSHAKE')).toBeTruthy();
}, 25000);

test('saves object and sends it back', async () => {
  const grader1 = await SocketWithBuffers.create();
  const grader2 = await SocketWithBuffers.create();

  const coinbaseTransactionMessage =
    '{"object":{"height":0,"outputs":[{"pubkey":"85acb336a150b16a9c6c8c27a4e9c479d9f99060a7945df0bb1b53365e98969b","value":50000000000000}],"type":"transaction"},"type":"object"}';

  grader1.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_1"}');
  grader1.sendMessage(coinbaseTransactionMessage);

  grader2.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_2"}');

  await new Promise((res) => setTimeout(res, 1000));

  grader1.sendMessage(
    '{"type":"getobject","objectid":"d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"}',
  );

  await new Promise((res) => setTimeout(res, 1000));

  expect(grader1.receivedMessages.includes(coinbaseTransactionMessage));
  expect(
    grader2.receivedMessages.includes(
      '{"type":"ihaveobject","objectid":"d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"}',
    ),
  );

  const transactionMessage =
    '{"object":{"inputs":[{"outpoint":{"index":0,"txid":"d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"},"sig":"6204bbab1b736ce2133c4ea43aff3767c49c881ac80b57ba38a3bab980466644cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04"}],"outputs":[{"pubkey":"b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985","value":10},{"pubkey":"8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9","value":49999999999990}],"type":"transaction"},"type":"object"}';

  grader1.sendMessage(transactionMessage);

  await new Promise((res) => setTimeout(res, 1000));

  grader1.sendMessage(
    '{"type":"getobject","objectid":"895ca2bea390b7508f780c7174900a631e73905dcdc6c07a6b61ede2ebd4033f"}',
  );

  await new Promise((res) => setTimeout(res, 1000));

  expect(grader1.receivedMessages.includes(transactionMessage));
  expect(
    grader2.receivedMessages.includes(
      '{"type":"ihaveobject","objectid":"895ca2bea390b7508f780c7174900a631e73905dcdc6c07a6b61ede2ebd4033f"}',
    ),
  );

  expect(grader1.receivedErrorMessage()).toBeFalsy();
  expect(grader2.receivedErrorMessage()).toBeFalsy();
}, 20000);

test('reacts correctly to invalid transactions', async () => {
  const grader1 = await SocketWithBuffers.create();
  const grader2 = await SocketWithBuffers.create();
  const grader3 = await SocketWithBuffers.create();
  const grader4 = await SocketWithBuffers.create();
  const grader5 = await SocketWithBuffers.create();

  grader1.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_1"}');
  grader2.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_2"}');
  grader3.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_3"}');
  grader4.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_4"}');
  grader5.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_5"}');

  const transactionMessageWithUnknownTransactionId =
    '{"object":{"inputs":[{"outpoint":{"index":0,"txid":"0000000000000000000000000004cb0b7286850e4c9c777d7e3c6e459b289347"},"sig":"6204bbab1b736ce2133c4ea43aff3767c49c881ac80b57ba38a3bab980466644cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04"}],"outputs":[{"pubkey":"b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985","value":10},{"pubkey":"8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9","value":49999999999990}],"type":"transaction"},"type":"object"}';

  grader1.sendMessage(transactionMessageWithUnknownTransactionId);

  await new Promise((res) => setTimeout(res, 1000));

  // Should return UNKNOWN_OBJECT error, but not drop the connection
  expect(grader1.receivedErrorMessage('UNKNOWN_OBJECT')).toBeTruthy();

  const transactionMessageWithInvalidSignature =
    '{"object":{"inputs":[{"outpoint":{"index":0,"txid":"d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"},"sig":"0000000000000002133c4ea43aff3767c49c881ac80b57ba38a3bab980466644cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04"}],"outputs":[{"pubkey":"b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985","value":10},{"pubkey":"8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9","value":49999999999990}],"type":"transaction"},"type":"object"}';

  grader1.sendMessage(transactionMessageWithInvalidSignature);

  await new Promise((res) => setTimeout(res, 1000));

  expect(grader1.receivedErrorMessage('INVALID_TX_SIGNATURE')).toBeTruthy();

  const transactionMessageWithInvalidOutpointIndex =
    '{"object":{"inputs":[{"outpoint":{"index":1,"txid":"d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"},"sig":"6204bbab1b736ce2133c4ea43aff3767c49c881ac80b57ba38a3bab980466644cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04"}],"outputs":[{"pubkey":"b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985","value":10},{"pubkey":"8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9","value":49999999999990}],"type":"transaction"},"type":"object"}';

  grader2.sendMessage(transactionMessageWithInvalidOutpointIndex);

  await new Promise((res) => setTimeout(res, 1000));

  expect(grader2.receivedErrorMessage('INVALID_TX_OUTPOINT')).toBeTruthy();

  const transactionMessageInvalidatingLawOfConservation =
    '{"object":{"inputs":[{"outpoint":{"index":0,"txid":"d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"},"sig":"6204bbab1b736ce2133c4ea43aff3767c49c881ac80b57ba38a3bab980466644cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04"}],"outputs":[{"pubkey":"b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985","value":20},{"pubkey":"8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9","value":49999999999990}],"type":"transaction"},"type":"object"}';

  grader3.sendMessage(transactionMessageInvalidatingLawOfConservation);

  await new Promise((res) => setTimeout(res, 1000));

  expect(grader3.receivedErrorMessage('INVALID_TX_CONSERVATION')).toBeTruthy();

  const transactionMessageWithEmptyInputs =
    '{"object":{"inputs":[],"outputs":[{"pubkey":"b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985","value":20},{"pubkey":"8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9","value":49999999999990}],"type":"transaction"},"type":"object"}';

  grader4.sendMessage(transactionMessageWithEmptyInputs);

  await new Promise((res) => setTimeout(res, 1000));

  expect(grader4.receivedErrorMessage('INVALID_FORMAT')).toBeTruthy();

  const transactionMessageWithEmptyOutputs =
    '{"object":{"inputs":[{"outpoint":{"index":0,"txid":"d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"},"sig":"0000000000000002133c4ea43aff3767c49c881ac80b57ba38a3bab980466644cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04"}],"outputs":[],"type":"transaction"},"type":"object"}';

  grader5.sendMessage(transactionMessageWithEmptyOutputs);

  await new Promise((res) => setTimeout(res, 1000));

  // Empty list of outputs is acceptable, so a transaction with an empty list of outputs and an incorrect signature will fail on a signature check,
  // which happens at the end.
  expect(grader5.receivedErrorMessage('INVALID_TX_SIGNATURE')).toBeTruthy();

  expect(grader1.receivedMessages.some((message) => message.includes('ihaveobject'))).toBeFalsy();
  expect(grader2.receivedMessages.some((message) => message.includes('ihaveobject'))).toBeFalsy();
  expect(grader3.receivedMessages.some((message) => message.includes('ihaveobject'))).toBeFalsy();
  expect(grader4.receivedMessages.some((message) => message.includes('ihaveobject'))).toBeFalsy();
  expect(grader5.receivedMessages.some((message) => message.includes('ihaveobject'))).toBeFalsy();
}, 20000);

test('Invalid block fails', async () => {
  const grader1 = await SocketWithBuffers.create(BLOCK_HOST_INCORRECT);
  const grader2 = await SocketWithBuffers.create(BLOCK_HOST_INCORRECT);
  const grader3 = await SocketWithBuffers.create(BLOCK_HOST_INCORRECT);
  const grader4 = await SocketWithBuffers.create(BLOCK_HOST_INCORRECT);
  const grader5 = await SocketWithBuffers.create(BLOCK_HOST_INCORRECT);

  grader1.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_1"}');
  grader2.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_2"}');
  grader3.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_3"}');
  grader4.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_4"}');
  grader5.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_5"}');

  const incorrectGenesis =
    '{"type":"object","object":{"T":"0000abcd00000000000000000000000000000000000000000000000000000000","created":1671062400,"miner":"Marabu","nonce":"00000000000000000000000000000000000000000000000000000000005bb0f2","note":"The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers","previd":null,"txids":[],"type":"block"}}';

  grader1.sendMessage(incorrectGenesis);

  const correctGenesis =
    '{"type":"object","object":{"T":"0000abc000000000000000000000000000000000000000000000000000000000","created":1671062400,"miner":"Marabu","nonce":"00000000000000000000000000000000000000000000000000000000005bb0f2","note":"The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers","previd":null,"txids":[],"type":"block"}}';

  grader2.sendMessage(correctGenesis);
  grader3.sendMessage(correctGenesis);
  grader4.sendMessage(correctGenesis);
  grader5.sendMessage(correctGenesis);

  const block1Correct =
    '{"type":"object","object":{"T":"0000abc000000000000000000000000000000000000000000000000000000000","created":1671148800,"miner":"grader","nonce":"00000000000000000000000000000000000000000000000000000000000463cf","note":"This block has a coinbase transaction","previd":"00002fa163c7dab0991544424b9fd302bb1782b185e5a3bbdf12afb758e57dee","txids":["6ebfb4c8e8e9b19dcf54c6ce3e1e143da1f473ea986e70c5cb8899a4671c933a"],"type":"block"}}';

  grader2.sendMessage(block1Correct);

  await new Promise((res) => setTimeout(res, 6000));

  expect(grader1.receivedErrorMessage('INVALID_FORMAT')).toBeTruthy();
  expect(grader2.receivedErrorMessage('UNFINDABLE_OBJECT')).toBeTruthy();
  expect(grader2.socket.netSocket.writable).toBeTruthy(); // After UNFINDABLE_OBJECT was returned, the peer should not be considered faulty.
}, 20000);

// More test cases:
// - object with given txid exists but is a block (INVALID_FORMAT) - for task 2 we are guaranteed, there will be no blocks, but TODO for future
// - The referenced transaction is invalid (INVALID_ANCESTRY) - when does it happen???
test('Valid block parsed succesfully and gossiped', async () => {
  const grader1 = await SocketWithBuffers.create(BLOCK_HOST);

  grader1.sendMessage('{"type":"hello","version":"0.10.0","agent":"grader_1"}');

  const genesis =
    '{"type":"object","object":{"T":"0000abc000000000000000000000000000000000000000000000000000000000","created":1671062400,"miner":"Marabu","nonce":"00000000000000000000000000000000000000000000000000000000005bb0f2","note":"The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers","previd":null,"txids":[],"type":"block"}}';

  grader1.sendMessage(genesis);

  await new Promise((res) => setTimeout(res, 1000));

  const coinbaseTx =
    '{"type":"object","object":{"height":1,"outputs":[{"pubkey":"3f0bc71a375b574e4bda3ddf502fe1afd99aa020bf6049adfe525d9ad18ff33f","value":50000000000000}],"type":"transaction"}}';

  grader1.sendMessage(coinbaseTx);

  await new Promise((res) => setTimeout(res, 500));

  const block1 =
    '{"type":"object","object":{"T":"0000abc000000000000000000000000000000000000000000000000000000000","created":1671148800,"miner":"grader","nonce":"00000000000000000000000000000000000000000000000000000000000463cf","note":"This block has a coinbase transaction","previd":"00002fa163c7dab0991544424b9fd302bb1782b185e5a3bbdf12afb758e57dee","txids":["6ebfb4c8e8e9b19dcf54c6ce3e1e143da1f473ea986e70c5cb8899a4671c933a"],"type":"block"}}';

  grader1.sendMessage(block1);

  await new Promise((res) => setTimeout(res, 1000));

  expect(grader1.receivedErrorMessage()).toBeFalsy();

  expect(
    grader1.receivedMessages.includes(
      '{"type":"ihaveobject","objectid":"6ebfb4c8e8e9b19dcf54c6ce3e1e143da1f473ea986e70c5cb8899a4671c933a"}',
    ),
  ).toBeTruthy();

  expect(
    grader1.receivedMessages.includes(
      '{"type":"ihaveobject","objectid":"00002fa163c7dab0991544424b9fd302bb1782b185e5a3bbdf12afb758e57dee"}',
    ),
  ).toBeTruthy();
  expect(
    grader1.receivedMessages.includes(
      '{"type":"ihaveobject","objectid":"000020cb0002575a71955763adf365c78182f0bb5bee767794ebc7346e0a2194"}',
    ),
  ).toBeTruthy();
});

test('Run external tests', async () => {
  const testCasesDir = path.join(__dirname, 'test_cases');
  const testFiles = fs.readdirSync(testCasesDir).filter((file) => file.endsWith('.json'));

  // Helper function to calculate object ID using canonical JSON (matching objectManager.id())
  const calculateObjectId = (obj: any): string => {
    const toCanonicalString = (o: any): string => {
      if (Array.isArray(o)) {
        const arrItems = o.map((item) => toCanonicalString(item));
        return '[' + arrItems.join(',') + ']';
      }
      if (typeof o === 'object' && o !== null) {
        const keys = Object.keys(o).sort();
        const keyValuePairs = keys.map((key) => `"${key}":${toCanonicalString(o[key])}`);
        return '{' + keyValuePairs.join(',') + '}';
      }
      return JSON.stringify(o);
    };

    const canonical = toCanonicalString(obj);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  };

  for (const testFile of testFiles) {
    const testCasePath = path.join(testCasesDir, testFile);
    const testCase = JSON.parse(fs.readFileSync(testCasePath, 'utf-8'));

    console.log(`\nRunning test: ${testCase.description} (${testFile})`);

    // Create a new socket for this test case
    const peer = await SocketWithBuffers.create('localhost:18021');

    // Send hello and getpeers messages
    peer.sendMessage('{"type":"hello","version":"0.10.0","agent":"test_runner"}');
    peer.sendMessage('{"type":"getpeers"}');
    peer.sendMessage(
      '{"type":"object","object":{"T":"0000abc000000000000000000000000000000000000000000000000000000000","created":1671062400,"miner":"Marabu","nonce":"00000000000000000000000000000000000000000000000000000000005bb0f2","note":"The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers","previd":null,"txids":[],"type":"block"}}',
    );

    await new Promise((res) => setTimeout(res, 1000));

    // Store all objects (for potential getobject responses from the node)
    const objects: Map<string, any> = new Map();

    // Separate plain objects (dependencies) from array objects (tests)
    const dependencyObjects: any[] = [];
    const objectsToTest: Array<[any, boolean]> = [];

    for (const obj of testCase.objects) {
      if (Array.isArray(obj)) {
        // Format: [object, shouldBeAccepted]
        const [message, shouldBeAccepted] = obj;
        objectsToTest.push([message, shouldBeAccepted]);
        if (message.object) {
          const objectId = calculateObjectId(message.object);
          objects.set(objectId, message);
        }
      } else {
        // Plain objects are dependencies - send but don't validate
        dependencyObjects.push(obj);
        if (obj.object) {
          const objectId = calculateObjectId(obj.object);
          objects.set(objectId, obj);
        }
      }
    }

    // First, send all dependency objects without validation
    for (const obj of dependencyObjects) {
      peer.sendMessage(JSON.stringify(obj));
      await new Promise((res) => setTimeout(res, 500));
    }

    let receivedError: string | null = null;

    // Now send and validate the test objects
    for (const [message, shouldBeAccepted] of objectsToTest) {
      peer.sendMessage(JSON.stringify(message));

      await new Promise((res) => setTimeout(res, 500));

      if (!shouldBeAccepted) {
        if (testCase.expected) {
          expect(peer.receivedErrorMessage(testCase.expected)).toBeTruthy();
        } else {
          expect(peer.receivedErrorMessage()).toBeFalsy();
        }
      }
      // Check if we received an error
      // if (peer.receivedErrorMessage()) {
      //   for (const msg of peer.receivedMessages) {
      //     try {
      //       const parsed = JSON.parse(msg);
      //       if (parsed.type === 'error') {
      //         receivedError = parsed.name;
      //         // If we expected this error, continue
      //         if (testCase.expected && receivedError === testCase.expected) {
      //           console.log(`  ✓ Received expected error: ${receivedError}`);
      //         } else if (!testCase.expected) {
      //           expect(receivedError).toBeNull(); // Fail with message showing which error was received
      //         }
      //       }
      //     } catch (e) {
      //       if (e instanceof SyntaxError) continue;
      //       throw e;
      //     }
      //   }
      // }

      // If this object should be accepted, verify we can get it back
      if (shouldBeAccepted && message.object) {
        const objectId = calculateObjectId(message.object);

        // Clear previous messages to avoid confusion
        const messageCountBefore = peer.receivedMessages.length;

        // Request the object back
        peer.sendMessage(JSON.stringify({ type: 'getobject', objectid: objectId }));

        await new Promise((res) => setTimeout(res, 1000));

        // Check if we received the object back
        let receivedObject = false;
        for (let i = messageCountBefore; i < peer.receivedMessages.length; i++) {
          const msg = peer.receivedMessages[i];
          try {
            const parsed = JSON.parse(msg);
            if (parsed.type === 'object' && calculateObjectId(parsed.object) === objectId) {
              receivedObject = true;
              console.log(`  ✓ Object ${objectId.substring(0, 16)}... was accepted and retrieved`);
              break;
            }
          } catch {}
        }

        if (shouldBeAccepted) {
          expect(receivedObject).toBeTruthy();
        }
      }
    }

    // Final check: if we expected an error but haven't received it yet, wait a bit more
    if (testCase.expected && !receivedError) {
      await new Promise((res) => setTimeout(res, 2000));

      expect(peer.receivedErrorMessage(testCase.expected)).toBeTruthy();
      console.log(`  ✓ Received expected error: ${testCase.expected}`);
    }

    peer.close();
    console.log(`✓ Completed: ${testFile}`);
  }
}, 300000); // 5 minute timeout for all test cases
