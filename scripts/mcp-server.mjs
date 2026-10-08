#!/usr/bin/env node
import readline from 'node:readline'
import { loadConfig } from './config.mjs'
import { TamClient } from './tam-client.mjs'

const config = loadConfig()
let client
let startupError = ''
try { client = new TamClient(config) } catch (error) { startupError = error.message }

const tools = [
  {
    name: 'tencentdb_memory_search',
    description: 'Search distilled L1 long-term memories relevant to a query.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'tencentdb_conversation_search',
    description: 'Search raw L0 conversation history.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 }, session_id: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'tencentdb_read_core',
    description: 'Read the L3 long-term user/agent core profile.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'tencentdb_list_scenes',
    description: 'List available L2 scenario memory files.',
    inputSchema: { type: 'object', properties: { path_prefix: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'tencentdb_read_scene',
    description: 'Read one L2 scenario memory file by its exact path.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
  },
  {
    name: 'tencentdb_capture_turn',
    description: 'Explicitly save one user/assistant turn into L0 memory. Normally the Stop hook captures turns automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        user_content: { type: 'string' },
        assistant_content: { type: 'string' },
      },
      required: ['session_id', 'user_content', 'assistant_content'],
      additionalProperties: false,
    },
  },
]

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function errorResponse(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
}

function textResult(value) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    ...(typeof value === 'object' && value !== null ? { structuredContent: value } : {}),
  }
}

function toolError(error) {
  return { content: [{ type: 'text', text: `TencentDB memory operation failed: ${error.message}` }], isError: true }
}

function requiredClient() {
  if (!client) throw new Error(startupError || 'TencentDB client is unavailable')
  return client
}

function validateArgs(name, args) {
  const tool = tools.find(item => item.name === name)
  if (!tool) throw new Error('Unknown tool')
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object')
  const schema = tool.inputSchema
  for (const key of schema.required || []) {
    if (!(key in args)) throw new Error(`Missing argument: ${key}`)
  }
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties[key]
    if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown argument: ${key}`)
    if (rule.type === 'string' && (typeof value !== 'string' || !value.trim() || value.length > config.maxCaptureChars)) throw new Error(`Invalid string argument: ${key}`)
    if (rule.type === 'integer' && (!Number.isInteger(value) || value < rule.minimum || value > rule.maximum)) throw new Error(`Invalid integer argument: ${key}`)
  }
}

async function callTool(name, args = {}) {
  validateArgs(name, args)
  const tam = requiredClient()
  switch (name) {
    case 'tencentdb_memory_search': return textResult(await tam.searchAtomic(args.query, args.limit || config.recallLimit))
    case 'tencentdb_conversation_search': return textResult(await tam.searchConversation(args.query, args.limit || config.recallLimit, args.session_id || ''))
    case 'tencentdb_read_core': return textResult(await tam.readCore())
    case 'tencentdb_list_scenes': return textResult(await tam.listScenarios(args.path_prefix || ''))
    case 'tencentdb_read_scene': return textResult(await tam.readScenario(args.path))
    case 'tencentdb_capture_turn': {
      const now = new Date().toISOString()
      return textResult(await tam.addConversation(args.session_id, [
        { role: 'user', content: args.user_content, timestamp: now },
        { role: 'assistant', content: args.assistant_content, timestamp: now },
      ]))
    }
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

async function handle(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return errorResponse(null, -32600, 'Invalid Request')
  const { id, method, params } = message
  if (id === undefined) return
  if (method === 'initialize') {
    response(id, {
      protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(params?.protocolVersion) ? params.protocolVersion : '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'tencentdb-memory-antigravity', version: '0.1.2' },
    })
    return
  }
  if (method === 'ping') return response(id, {})
  if (method === 'tools/list') return response(id, { tools })
  if (method === 'tools/call') {
    try { response(id, await callTool(params?.name, params?.arguments || {})) }
    catch (error) { response(id, toolError(error)) }
    return
  }
  if (method?.startsWith('notifications/')) return
  if (id !== undefined) errorResponse(id, -32601, `Method not found: ${method}`)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', line => {
  if (!line.trim()) return
  let message
  try { message = JSON.parse(line) } catch { return errorResponse(null, -32700, 'Parse error') }
  Promise.resolve(handle(message)).catch(error => errorResponse(message.id ?? null, -32603, error.message))
})
