import { ChildProcess, spawn } from 'child_process'

import os from 'os'
import fs from 'fs'
import path from 'path'

import { MessageSocket } from '@src/network'


const tmpBase = os.tmpdir();

let processes: Array<ChildProcess> = []
let temporaryDirectories: Array<string> = []

const startNode = () => {
  const databaseDirectory = fs.mkdtempSync(path.join(tmpBase, 'kerma-'))


  const proc = spawn('npm', ['run', 'start'], { env: { ...process.env, 'OBJECT_DATABASE_DIRECTORY': databaseDirectory }, stdio: 'inherit' })

  processes.push(proc)
  temporaryDirectories.push(databaseDirectory)
}

beforeAll(async () => {
  startNode()

  await new Promise((res) => setTimeout(res, 3000))
})

test('receives hello', async () => {
  const socket = MessageSocket.createClient('localhost:18018')

  let receivedMessages: Array<string> = []

  socket.on('message', (message: string) => {
    receivedMessages.push(message)
  })

  await new Promise((res) => setTimeout(res, 3000))

  expect(receivedMessages).toContain(receivedMessages.includes('{"type":"hello","version":"0.10.0","agent":"b0b3r"}'));

  socket.end()
})
