import os from 'os';
import fs from 'fs';
import path from 'path';

import { ChildProcess, spawn } from 'child_process';
import { MessageSocket } from '@src/network';

const DEFAULT_HOST = 'localhost:18018';

const tmpBase = os.tmpdir();

let globalNodes: Node[] = [];

interface Node {
  proc: ChildProcess;
  temporaryDirectory: string;
}

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

const startNode = (env?: object): Node => {
  const databaseDirectory = fs.mkdtempSync(path.join(tmpBase, 'kerma-'));

  const proc = spawn('npm', ['run', 'start'], {
    env: {
      ...process.env,
      OBJECT_DATABASE_DIRECTORY: databaseDirectory,
      AGENT_HOST_ADDRESS: 'localhost:18018',
      ...env,
    },
    stdio: 'inherit',
  });

  return {
    proc,
    temporaryDirectory: databaseDirectory,
  };
};

const cleanupNode = (node: Node) => {
  node.proc.kill('SIGTERM');

  if (fs.existsSync(node.temporaryDirectory)) {
    fs.rmSync(node.temporaryDirectory, { recursive: true, force: true });
  }
};

beforeAll(async () => {
  const node = startNode();
  globalNodes.push(node);

  await new Promise((res) => setTimeout(res, 2000));
});

afterAll(() => {
  // Kill all global nodes
  globalNodes.forEach(cleanupNode);
  globalNodes = [];
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

test('nodes exchange known peers', async () => {
  const node1 = startNode({
    BIND_PORT: 18019,
    AGENT_HOST_ADDRESS: 'localhost:18019',
    BOOTSTRAP_PEERS: 'localhost:18020',
  });

  const node2 = startNode({
    BIND_PORT: 18020,
    AGENT_HOST_ADDRESS: 'localhost:18020',
    BOOTSTRAP_PEERS: 'localhost:18019',
  });

  await new Promise((res) => setTimeout(res, 3000));

  const peer1 = await SocketWithBuffers.create('localhost:18019');
  const peer2 = await SocketWithBuffers.create('localhost:18020');

  peer1.sendMessage('{"type":"hello","version":"0.10.0","agent":"b0b3r_2"}');
  peer2.sendMessage('{"type":"hello","version":"0.10.0","agent":"b0b3r_2"}');
  peer1.sendMessage('{"type":"getpeers"}');
  peer2.sendMessage('{"type":"getpeers"}');

  await new Promise((res) => setTimeout(res, 3000));

  expect(
    peer1.receivedMessages.some(
      (message) => message.includes('"type":"peers"') && message.includes('localhost:18020'),
    ),
  ).toBeTruthy();
  expect(
    peer2.receivedMessages.some(
      (message) => message.includes('"type":"peers"') && message.includes('localhost:18019'),
    ),
  ).toBeTruthy();

  cleanupNode(node1);
  cleanupNode(node2);
}, 20000);
