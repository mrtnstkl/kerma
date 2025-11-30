import os from 'os';
import fs from 'fs';
import path from 'path';

const tmpBase = os.tmpdir();
const databaseDirectory = fs.mkdtempSync(path.join(tmpBase, 'kerma-'));

process.env.OBJECT_DATABASE_DIRECTORY = databaseDirectory;

import { objectManager } from '../src/object';

afterAll(() => {
  if (fs.existsSync(databaseDirectory)) {
    fs.rmSync(databaseDirectory, { recursive: true, force: true });
  }
});

test('genesis block has correct id', () => {
  const genesisBlock1 = {
    T: '0000abc000000000000000000000000000000000000000000000000000000000',
    created: 1671062400,
    miner: 'Marabu',
    nonce: '00000000000000000000000000000000000000000000000000000000005bb0f2',
    note: 'The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers',
    previd: null,
    txids: [],
    type: 'block',
  };

  const genesisBlock2 = {
    type: 'block',
    miner: 'Marabu',
    T: '0000abc000000000000000000000000000000000000000000000000000000000',
    txids: [],
    nonce: '00000000000000000000000000000000000000000000000000000000005bb0f2',
    note: 'The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers',
    created: 1671062400,
    previd: null,
  };

  const nonGenesisBlock = {
    T: '0000abc000000000000000000000000000000000000000000000000000000000',
    created: 1671148800,
    miner: 'grader',
    nonce: '00000000000000000000000000000000000000000000000000000000000463cf',
    note: 'This block has a coinbase transaction',
    previd: '00002fa163c7dab0991544424b9fd302bb1782b185e5a3bbdf12afb758e57dee',
    txids: ['6ebfb4c8e8e9b19dcf54c6ce3e1e143da1f473ea986e70c5cb8899a4671c933a'],
    type: 'block',
  };

  expect(objectManager.id(genesisBlock1)).toBe(
    '00002fa163c7dab0991544424b9fd302bb1782b185e5a3bbdf12afb758e57dee',
  );

  expect(objectManager.id(genesisBlock2)).toBe(
    '00002fa163c7dab0991544424b9fd302bb1782b185e5a3bbdf12afb758e57dee',
  );

  expect(objectManager.id(nonGenesisBlock)).toBe(
    '000020cb0002575a71955763adf365c78182f0bb5bee767794ebc7346e0a2194',
  );
});

test('coinbase transaction has correct id', () => {
  const tx1 = {
    height: 0,
    outputs: [
      {
        pubkey: '85acb336a150b16a9c6c8c27a4e9c479d9f99060a7945df0bb1b53365e98969b',
        value: 50000000000000,
      },
    ],
    type: 'transaction',
  };

  const tx2 = {
    outputs: [
      {
        pubkey: '85acb336a150b16a9c6c8c27a4e9c479d9f99060a7945df0bb1b53365e98969b',
        value: 50000000000000,
      },
    ],
    type: 'transaction',
    height: 0,
  };

  expect(objectManager.id(tx1)).toBe(
    'd46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347',
  );

  expect(objectManager.id(tx2)).toBe(
    'd46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347',
  );
});

test('transaction has correct id', () => {
  const tx1 = {
    inputs: [
      {
        outpoint: {
          index: 0,
          txid: 'd46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347',
        },
        sig:
          '6204bbab1b736ce2133c4ea43aff3767c49c881ac80b57ba38a3bab980466644' +
          'cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04',
      },
    ],
    outputs: [
      {
        pubkey: 'b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985',
        value: 10,
      },
      {
        pubkey: '8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9',
        value: 49999999999990,
      },
    ],
    type: 'transaction',
  };

  const tx2 = {
    outputs: [
      {
        pubkey: 'b539258e808b3e3354b9776d1ff4146b52282e864f56224e7e33e7932ec72985',
        value: 10,
      },
      {
        pubkey: '8dbcd2401c89c04d6e53c81c90aa0b551cc8fc47c0469217c8f5cfbae1e911f9',
        value: 49999999999990,
      },
    ],
    type: 'transaction',
    inputs: [
      {
        outpoint: {
          txid: 'd46d09138f0251edc32e28f1a744cb0b7286850e4c9c777d7e3c6e459b289347',
          index: 0,
        },
        sig:
          '6204bbab1b736ce2133c4ea43aff3767c49c881ac80b57ba38a3bab980466644' +
          'cdbacc86b1f4357cfe45e6374b963f5455f26df0a86338310df33e50c15d7f04',
      },
    ],
  };

  expect(objectManager.id(tx1)).toBe(
    '895ca2bea390b7508f780c7174900a631e73905dcdc6c07a6b61ede2ebd4033f',
  );
  expect(objectManager.id(tx2)).toBe(
    '895ca2bea390b7508f780c7174900a631e73905dcdc6c07a6b61ede2ebd4033f',
  );
});
