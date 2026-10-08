import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function safeId(value) {
  return crypto.createHash('sha256').update(String(value || 'unknown')).digest('hex').slice(0, 32)
}

export function stateFile(config, conversationId) {
  return path.join(config.stateDir, `${safeId(conversationId)}.json`)
}

export function readState(config, conversationId) {
  const file = stateFile(config, conversationId)
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      captured: Array.isArray(value.captured) ? value.captured : [],
      lastRecallKey: typeof value.lastRecallKey === 'string' ? value.lastRecallKey : '',
    }
  } catch {
    return { captured: [], lastRecallKey: '' }
  }
}

export function writeState(config, conversationId, state) {
  fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o700 })
  const file = stateFile(config, conversationId)
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify({
    captured: [...new Set(state.captured || [])],
    lastRecallKey: state.lastRecallKey || '',
  }, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temp, file)
}

export function hashText(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex')
}
