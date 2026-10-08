import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('installer preserves config, separates backups and handles spaces in paths', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tam install '))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const workspace = path.join(temp, 'workspace with spaces')
  fs.mkdirSync(workspace)
  const install = (...args) => spawnSync('bash', [path.join(root, 'install.sh'), ...args], { encoding: 'utf8' })
  let result = install('--workspace', workspace)
  assert.equal(result.status, 0, result.stderr)
  const target = path.join(workspace, '.agents/plugins/tencentdb-memory-antigravity')
  const config = path.join(target, 'config.env')
  fs.writeFileSync(config, 'TAM_API_KEY=synthetic-test-value\n')
  result = install('--workspace', workspace)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(config, 'utf8'), 'TAM_API_KEY=synthetic-test-value\n')
  assert.equal(fs.statSync(config).mode & 0o777, 0o600)
  assert.equal(fs.readdirSync(path.join(workspace, '.agents/plugins')).length, 1)
  assert.equal(fs.readdirSync(path.join(workspace, '.agents/plugin-backups')).length, 1)
  const mcp = JSON.parse(fs.readFileSync(path.join(target, 'mcp_config.json'), 'utf8'))
  assert.ok(path.isAbsolute(mcp.mcpServers.m.command))
  assert.ok(path.isAbsolute(mcp.mcpServers.m.args[0]))
  assert.notEqual(install('--workspace').status, 0)
})
