import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readState, writeState } from '../scripts/state.mjs'

test('retains acknowledged turns beyond the previous 500-turn replay boundary', t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tam-state-'))
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }))
  const captured = Array.from({ length: 550 }, (_, i) => `turn-${i}`)
  writeState({ stateDir }, 'conversation', { captured, lastRecallKey: 'recall' })
  assert.deepEqual(readState({ stateDir }, 'conversation').captured, captured)
})
