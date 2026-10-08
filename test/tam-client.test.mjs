import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { TamClient } from '../scripts/tam-client.mjs'

async function mockServer() {
  const requests = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
    requests.push({ url: req.url, headers: req.headers, body })
    res.setHeader('content-type', 'application/json')
    if (req.url === '/health') return res.end(JSON.stringify({ ok: true }))
    if (req.url === '/v3/atomic/search') return res.end(JSON.stringify({ code: 0, data: { items: [{ type: 'preference', content: 'Użytkownik preferuje LXC.' }] } }))
    if (req.url === '/v3/core/read') return res.end(JSON.stringify({ code: 0, data: { content: 'Profil użytkownika' } }))
    if (req.url === '/v3/scenario/ls') return res.end(JSON.stringify({ code: 0, data: { entries: [{ path: 'homelab.md', summary: 'Infrastruktura' }] } }))
    if (req.url === '/v3/conversation/add') return res.end(JSON.stringify({ code: 0, data: { accepted_ids: ['1', '2'], total_count: 2 } }))
    res.statusCode = 404
    res.end(JSON.stringify({ code: 404, message: 'not found' }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, requests, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

function config(baseUrl) {
  return {
    baseUrl, apiKey: 'test-key', userKey: 'user-key', serviceId: 'default',
    teamId: 'team', agentId: 'antigravity', userId: 'adam', taskId: '',
    recallLimit: 5, recallTimeoutMs: 2000, writeTimeoutMs: 2000,
    maxContextChars: 12000, maxMemoryChars: 2400, allowInsecureHttp: false,
  }
}

test('recalls L1/L2/L3 and sends v3 isolation/auth headers', async t => {
  const mock = await mockServer()
  t.after(() => mock.server.close())
  const client = new TamClient(config(mock.baseUrl))
  const result = await client.recall('Co preferuje użytkownik?', 'session-1')
  assert.match(result.context, /preferuje LXC/)
  assert.match(result.context, /Profil użytkownika/)
  assert.match(result.context, /homelab\.md/)
  const request = mock.requests.find(item => item.url === '/v3/atomic/search')
  assert.equal(request.headers.authorization, 'Bearer test-key')
  assert.equal(request.headers['x-tdai-user-key'], 'user-key')
  assert.equal(request.body.agent_id, 'antigravity')
  assert.equal(request.body.session_id, undefined)
})

test('writes a complete turn to L0', async t => {
  const mock = await mockServer()
  t.after(() => mock.server.close())
  const client = new TamClient(config(mock.baseUrl))
  const data = await client.addConversation('session-2', [
    { role: 'user', content: 'pytanie' },
    { role: 'assistant', content: 'odpowiedź' },
  ])
  assert.equal(data.total_count, 2)
  const request = mock.requests.find(item => item.url === '/v3/conversation/add')
  assert.equal(request.body.session_id, 'session-2')
  assert.equal(request.body.messages.length, 2)
})

test('rejects insecure non-loopback HTTP by default', () => {
  assert.throws(() => new TamClient(config('http://192.168.1.50:8420')), /Refusing plain HTTP/)
})

test('refuses redirects so Core credentials cannot reach a redirected endpoint', async t => {
  let redirectedRequests = 0
  const destination = http.createServer((req, res) => { redirectedRequests += 1; res.end('{}') })
  destination.listen(0, '127.0.0.1')
  await once(destination, 'listening')
  t.after(() => destination.close())
  const source = http.createServer((req, res) => {
    res.writeHead(307, { location: `http://127.0.0.1:${destination.address().port}/capture` })
    res.end()
  })
  source.listen(0, '127.0.0.1')
  await once(source, 'listening')
  t.after(() => source.close())
  const client = new TamClient(config(`http://127.0.0.1:${source.address().port}`))
  await assert.rejects(client.readCore())
  await assert.rejects(client.health())
  assert.equal(redirectedRequests, 0)
})
