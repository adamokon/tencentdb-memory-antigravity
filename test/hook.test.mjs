import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

async function serverFixture() {
  const requests = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    requests.push({ url: req.url, body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {} })
    res.setHeader('content-type', 'application/json')
    const data = req.url === '/v3/atomic/search' ? { items: [{ type: 'fact', content: 'Zapamiętany fakt' }] }
      : req.url === '/v3/core/read' ? { content: 'Rdzeń profilu' }
      : req.url === '/v3/scenario/ls' ? { entries: [] }
      : req.url === '/v3/conversation/add' ? { accepted_ids: ['a', 'b'], total_count: 2 }
      : {}
    res.end(JSON.stringify({ code: 0, data }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, requests, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

async function runHook(mode, input, env) {
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'hook.mjs'), mode], { env: { ...process.env, ...env } })
  const stdout = []
  const stderr = []
  child.stdout.on('data', chunk => stdout.push(chunk))
  child.stderr.on('data', chunk => stderr.push(chunk))
  child.stdin.end(JSON.stringify(input))
  const [code] = await once(child, 'close')
  assert.equal(code, 0, Buffer.concat(stderr).toString())
  return JSON.parse(Buffer.concat(stdout).toString())
}

test('PreInvocation injects recall and Stop captures each turn once', async t => {
  const fixture = await serverFixture()
  t.after(() => fixture.server.close())
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tam-agy-test-'))
  const transcript = path.join(temp, 'transcript.jsonl')
  fs.writeFileSync(transcript, [
    JSON.stringify({ message: { role: 'user', content: 'Moje pytanie' } }),
    JSON.stringify({ message: { role: 'assistant', content: 'Moja odpowiedź' } }),
  ].join('\n'))
  const env = {
    TAM_BASE_URL: fixture.baseUrl,
    TAM_API_KEY: 'test',
    TAM_STATE_DIR: path.join(temp, 'state'),
  }
  const common = { conversationId: 'conversation-1', transcriptPath: transcript, workspacePaths: [temp] }
  const recalled = await runHook('pre-invocation', { ...common, invocationNum: 0 }, env)
  assert.match(recalled.injectSteps[0].ephemeralMessage, /Zapamiętany fakt/)
  await runHook('stop', { ...common, fullyIdle: false, terminationReason: 'NO_TOOL_CALL' }, env)
  assert.equal(fixture.requests.filter(item => item.url === '/v3/conversation/add').length, 0)
  const stopped = await runHook('stop', { ...common, fullyIdle: true, terminationReason: 'NO_TOOL_CALL' }, env)
  assert.equal(stopped.decision, 'allow')
  await runHook('stop', { ...common, fullyIdle: true, terminationReason: 'NO_TOOL_CALL' }, env)
  assert.equal(fixture.requests.filter(item => item.url === '/v3/conversation/add').length, 1)
})

test('capture drains the oldest backlog without skipping or replaying acknowledged turns', async t => {
  const fixture = await serverFixture()
  t.after(() => fixture.server.close())
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tam-backlog-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const transcript = path.join(temp, 'transcript.jsonl')
  const records = Array.from({ length: 25 }, (_, i) => [
    { role: 'user', content: `question-${i}` },
    { role: 'assistant', content: `answer-${i}` },
  ]).flat()
  fs.writeFileSync(transcript, records.map(record => JSON.stringify(record)).join('\n'))
  const env = { TAM_BASE_URL: fixture.baseUrl, TAM_STATE_DIR: path.join(temp, 'state') }
  const input = { conversationId: 'backlog', transcriptPath: transcript, fullyIdle: true, terminationReason: 'NO_TOOL_CALL' }
  await runHook('stop', input, env)
  let writes = fixture.requests.filter(item => item.url === '/v3/conversation/add')
  assert.equal(writes.length, 20)
  assert.equal(writes[0].body.messages[0].content, 'question-0')
  await runHook('stop', input, env)
  await runHook('stop', input, env)
  writes = fixture.requests.filter(item => item.url === '/v3/conversation/add')
  assert.deepEqual(writes.map(item => item.body.messages[0].content), Array.from({ length: 25 }, (_, i) => `question-${i}`))
})
