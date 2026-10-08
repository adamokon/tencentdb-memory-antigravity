import fs from 'node:fs'
import crypto from 'node:crypto'

const ROLE_KEYS = ['role', 'author', 'speaker', 'type']
const CONTENT_KEYS = ['content', 'text', 'message', 'output', 'response']

function normalizedRole(value) {
  const role = String(value ?? '').toLowerCase()
  if (role === 'user' || role === 'human') return 'user'
  if (role === 'assistant' || role === 'model' || role === 'ai') return 'assistant'
  return ''
}

function textFrom(value, depth = 0) {
  if (depth > 5 || value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(item => textFrom(item, depth + 1)).filter(Boolean).join('\n')
  if (typeof value !== 'object') return ''
  for (const key of CONTENT_KEYS) {
    if (key in value) {
      const text = textFrom(value[key], depth + 1)
      if (text) return text
    }
  }
  if (value.parts) return textFrom(value.parts, depth + 1)
  return ''
}

function findMessage(value, depth = 0) {
  if (depth > 6 || value == null || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMessage(item, depth + 1)
      if (found) return found
    }
    return null
  }
  // Native Antigravity trajectory records: exclude tools, thinking and unfinished steps.
  if (typeof value.type === 'string' && /^[A-Z_]+$/.test(value.type)) {
    const role = value.type === 'USER_INPUT' ? 'user' : value.type === 'PLANNER_RESPONSE' ? 'assistant' : ''
    if (!role || value.status !== 'DONE' || typeof value.content !== 'string' || !value.content.trim()) return null
    return { role, content: value.content.trim(), timestamp: value.created_at || '' }
  }
  for (const key of ROLE_KEYS) {
    const role = normalizedRole(value[key])
    if (role) {
      const content = textFrom(value)
      if (content.trim()) return { role, content: content.trim(), timestamp: value.timestamp || value.createdAt || value.time || '' }
    }
  }
  for (const key of ['message', 'data', 'event', 'payload', 'record', 'step']) {
    if (key in value) {
      const found = findMessage(value[key], depth + 1)
      if (found) return found
    }
  }
  return null
}

export function parseTranscriptText(text) {
  const messages = []
  const lines = text.split(/\r?\n/)
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim()
    if (!line) continue
    let value
    try { value = JSON.parse(line) } catch { continue }
    const message = findMessage(value)
    if (!message) continue
    messages.push({ ...message, lineIndex })
  }
  return messages
}

export function readTranscript(file) {
  return parseTranscriptText(fs.readFileSync(file, 'utf8'))
}

export function latestUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i]
  }
  return null
}

export function completedTurns(messages) {
  const turns = []
  let user = null
  let assistants = []
  const flush = () => {
    if (!user || !assistants.length) return
    const assistant = assistants[assistants.length - 1]
    const id = crypto.createHash('sha256')
      .update(`${user.lineIndex}\0${user.content}\0${assistant.lineIndex}\0${assistant.content}`)
      .digest('hex')
    turns.push({ id, user, assistant })
  }
  for (const message of messages) {
    if (message.role === 'user') {
      flush()
      user = message
      assistants = []
    } else if (message.role === 'assistant' && user) {
      assistants.push(message)
    }
  }
  flush()
  return turns
}

export function isoTimestamp(value, fallback = new Date().toISOString()) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? fallback : date.toISOString()
}
