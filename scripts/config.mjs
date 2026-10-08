import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function unquote(value) {
  const text = value.trim()
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1)
  }
  return text
}

export function readEnvFile(file = path.join(pluginRoot, 'config.env')) {
  const result = {}
  if (!fs.existsSync(file)) return result
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    result[match[1]] = unquote(match[2])
  }
  return result
}

function intValue(value, fallback, min, max) {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === '') return fallback
  return /^(1|true|yes|on)$/i.test(String(value))
}

function defaultStateDir() {
  const base = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    : (process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'))
  return path.join(base, 'tencentdb-memory-antigravity')
}

export function loadConfig(overrides = {}) {
  const fileEnv = readEnvFile()
  const env = { ...fileEnv, ...process.env, ...overrides }
  const baseUrl = (env.TAM_BASE_URL || 'http://127.0.0.1:8420').replace(/\/+$/, '')
  return {
    baseUrl,
    apiKey: env.TAM_API_KEY || 'local',
    userKey: env.TAM_USER_KEY || '',
    serviceId: env.TAM_SERVICE_ID || 'default',
    teamId: env.TAM_TEAM_ID || 'default',
    agentId: env.TAM_AGENT_ID || 'antigravity',
    userId: env.TAM_USER_ID || 'default',
    taskId: env.TAM_TASK_ID || '',
    recallLimit: intValue(env.TAM_RECALL_LIMIT, 5, 1, 20),
    recallTimeoutMs: intValue(env.TAM_RECALL_TIMEOUT_MS, 3000, 250, 30000),
    writeTimeoutMs: intValue(env.TAM_WRITE_TIMEOUT_MS, 5000, 250, 30000),
    maxContextChars: intValue(env.TAM_MAX_CONTEXT_CHARS, 12000, 1000, 100000),
    maxMemoryChars: intValue(env.TAM_MAX_MEMORY_CHARS, 2400, 200, 20000),
    maxCaptureChars: intValue(env.TAM_MAX_CAPTURE_CHARS, 50000, 1000, 500000),
    recallEveryInvocation: boolValue(env.TAM_RECALL_EVERY_INVOCATION, false),
    allowInsecureHttp: boolValue(env.TAM_ALLOW_INSECURE_HTTP, false),
    stateDir: env.TAM_STATE_DIR || defaultStateDir(),
  }
}

export function validateTransport(config) {
  let url
  try {
    url = new URL(config.baseUrl)
  } catch {
    throw new Error('TAM_BASE_URL is not a valid URL')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('TAM_BASE_URL must use http or https')
  if (url.username || url.password) throw new Error('Use TAM_API_KEY instead of credentials embedded in TAM_BASE_URL')
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  if (url.protocol === 'http:' && !loopback && !config.allowInsecureHttp) {
    throw new Error('Refusing plain HTTP to a non-loopback host. Use HTTPS or set TAM_ALLOW_INSECURE_HTTP=1 on a trusted private network.')
  }
}
