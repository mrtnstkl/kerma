import os from 'os';
import fs from 'fs';
import path from 'path';

import { ChildProcess, spawn } from 'child_process';
import { MessageSocket } from '@src/network';

const DEFAULT_HOST = 'localhost:18018';

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

const startNode = () => {
  const databaseDirectory = fs.mkdtempSync(path.join(tmpBase, 'kerma-'));

  const proc = spawn('npm', ['run', 'start'], {
    env: { ...process.env, OBJECT_DATABASE_DIRECTORY: databaseDirectory },
    stdio: 'inherit',
    shell: true,
  });

  processes.push(proc);
  temporaryDirectories.push(databaseDirectory);
};

beforeAll(async () => {
  startNode();

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
      '{"type":"ihaveobject","d46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347"}',
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
}, 20000);
