#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.')
const hookPath = path.join(root, 'scripts', 'hook.mjs')
const mcpPath = path.join(root, 'scripts', 'mcp-server.mjs')

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`
}

const hooksTemplate = JSON.parse(fs.readFileSync(path.join(root, 'hooks.json.template'), 'utf8'))
const handlers = hooksTemplate['tencentdb-memory']
for (const eventName of ['PreInvocation', 'Stop']) {
  for (const handler of handlers[eventName] || []) {
    handler.command = handler.command.replace('__HOOK_COMMAND__', `${shellQuote(process.execPath)} ${shellQuote(hookPath)}`)
  }
}
fs.writeFileSync(path.join(root, 'hooks.json'), `${JSON.stringify(hooksTemplate, null, 2)}\n`)

const mcpTemplate = JSON.parse(fs.readFileSync(path.join(root, 'mcp_config.json.template'), 'utf8'))
mcpTemplate.mcpServers['m'].command = process.execPath
mcpTemplate.mcpServers['m'].args = [mcpPath]
fs.writeFileSync(path.join(root, 'mcp_config.json'), `${JSON.stringify(mcpTemplate, null, 2)}\n`)
