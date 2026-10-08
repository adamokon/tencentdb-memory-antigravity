import test from 'node:test'
import assert from 'node:assert/strict'
import { completedTurns, latestUserMessage, parseTranscriptText } from '../scripts/transcript.mjs'

test('parses common nested Antigravity-style JSONL messages', () => {
  const text = [
    JSON.stringify({ event: { message: { role: 'user', content: 'Pierwsze pytanie', timestamp: '2026-08-29T10:00:00Z' } } }),
    JSON.stringify({ data: { role: 'assistant', parts: [{ text: 'Pierwsza odpowiedź' }] } }),
    JSON.stringify({ payload: { message: { author: 'human', text: 'Drugie pytanie' } } }),
    JSON.stringify({ record: { speaker: 'model', content: [{ type: 'text', text: 'Druga odpowiedź' }] } }),
  ].join('\n')
  const messages = parseTranscriptText(text)
  assert.deepEqual(messages.map(item => item.role), ['user', 'assistant', 'user', 'assistant'])
  assert.equal(latestUserMessage(messages).content, 'Drugie pytanie')
  const turns = completedTurns(messages)
  assert.equal(turns.length, 2)
  assert.equal(turns[1].assistant.content, 'Druga odpowiedź')
  assert.match(turns[0].id, /^[a-f0-9]{64}$/)
})

test('ignores malformed JSONL and non-user/tool records', () => {
  const text = ['not-json', JSON.stringify({ role: 'tool', content: 'secret tool log' }), JSON.stringify({ role: 'user', content: '' })].join('\n')
  assert.deepEqual(parseTranscriptText(text), [])
})

 test('parses native DONE records and excludes tools, thinking and unfinished output', () => {
 const records = [
 {type:'USER_INPUT', source:'USER_EXPLICIT',status:'DONE',content:'remember a marker',created_at:'2026-09-21T06:00:00Z'},
 {type:'GENERIC',source:'MODEL',status:'DONE',content:'tool output'},
 {type:'PLANNER_RESPONSE',source:'MODEL',status:'RUNNING',content:'partial'},
 {type:'PLANNER_RESPONSE',source:'MODEL',status:'DONE',content:'saved marker',thinking:'private reasoning',created_at:'2026-09-21T06:00:01Z'}
 ]
 const messages = parseTranscriptText(records.map(x=>JSON.stringify(x)).join('\n'))
 assert.deepEqual(messages.map(x=>x.content),['remember a marker','saved marker'])
 assert.equal(completedTurns(messages).length,1)
 assert.equal(messages[0].timestamp,records[0].created_at)
 })
