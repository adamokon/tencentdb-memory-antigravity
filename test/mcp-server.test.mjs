import test from 'node:test'
import assert from 'node:assert/strict'
import readline from 'node:readline'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('MCP server initializes and lists tools over stdio', async t => {
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'mcp-server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] })
  t.after(() => child.kill())
  const lines = []
  readline.createInterface({ input: child.stdout }).on('line', line => lines.push(line))
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`)
  child.stdin.write('null\n')
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'tencentdb_capture_turn', arguments: {} } })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'tencentdb_memory_search', arguments: { query: 'test', limit: 0 } } })}\n`)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MCP response timeout')), 5000)
    const timer = setInterval(() => {
      if (lines.length >= 5) {
        clearTimeout(timeout)
        clearInterval(timer)
        resolve()
      }
    }, 10)
  })
  const responses = lines.map(line => JSON.parse(line))
  assert.equal(responses.find(item => item.id === 1).result.serverInfo.name, 'tencentdb-memory-antigravity')
  assert.equal(responses.find(item => item.id === null).error.code, -32600)
  assert.equal(responses.find(item => item.id === 3).result.isError, true)
  assert.equal(responses.find(item => item.id === 4).result.isError, true)
  const names = responses.find(item => item.id === 2).result.tools.map(tool => tool.name)
  for (const name of names) assert.ok(`mcp_tencentdb-memory-antigravity_m_${name}`.length <= 64)
  assert.ok(names.includes('tencentdb_memory_search'))
  assert.ok(names.includes('tencentdb_capture_turn'))
})
