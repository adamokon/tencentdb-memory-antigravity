import { validateTransport } from './config.mjs'

function trimText(value, max) {
  const text = String(value ?? '').trim()
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export class TamError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'TamError'
    this.details = details
  }
}

export class TamClient {
  constructor(config) {
    validateTransport(config)
    this.config = config
  }

  headers() {
    const headers = {
      'content-type': 'application/json',
      'authorization': `Bearer ${this.config.apiKey || 'local'}`,
      'x-tdai-service-id': this.config.serviceId || 'default',
    }
    if (this.config.userKey) headers['x-tdai-user-key'] = this.config.userKey
    return headers
  }

  isolation(sessionId = '') {
    return {
      team_id: this.config.teamId,
      agent_id: this.config.agentId,
      user_id: this.config.userId,
      ...(this.config.taskId ? { task_id: this.config.taskId } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
    }
  }

  async request(pathname, body, timeoutMs = this.config.recallTimeoutMs) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${this.config.baseUrl}${pathname}`, {
        method: 'POST',
        redirect: 'error',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const raw = await response.text()
      let envelope
      try {
        envelope = raw ? JSON.parse(raw) : {}
      } catch {
        throw new TamError(`TencentDB returned non-JSON data for ${pathname}`, { status: response.status })
      }
      if (!response.ok) {
        throw new TamError(`TencentDB ${pathname} failed with HTTP ${response.status}`, { status: response.status, message: envelope?.message })
      }
      if (typeof envelope.code === 'number' && envelope.code !== 0) {
        throw new TamError(`TencentDB ${pathname} returned code ${envelope.code}`, { code: envelope.code })
      }
      return envelope.data ?? envelope
    } catch (error) {
      if (error?.name === 'AbortError') throw new TamError(`TencentDB ${pathname} timed out after ${timeoutMs} ms`)
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  health(timeoutMs = 2000) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    return fetch(`${this.config.baseUrl}/health`, { headers: this.headers(), signal: controller.signal, redirect: 'error' })
      .then(async response => ({ ok: response.ok, status: response.status, body: await response.text() }))
      .finally(() => clearTimeout(timeout))
  }

  searchAtomic(query, limit = this.config.recallLimit, sessionId = '') {
    return this.request('/v3/atomic/search', { ...this.isolation(sessionId), query, limit })
  }

  searchConversation(query, limit = this.config.recallLimit, sessionId = '') {
    return this.request('/v3/conversation/search', { ...this.isolation(sessionId), query, limit })
  }

  readCore() {
    return this.request('/v3/core/read', this.isolation())
  }

  listScenarios(pathPrefix = '') {
    return this.request('/v3/scenario/ls', { ...this.isolation(), ...(pathPrefix ? { path_prefix: pathPrefix } : {}) })
  }

  readScenario(scenePath) {
    return this.request('/v3/scenario/read', { ...this.isolation(), path: scenePath })
  }

  addConversation(sessionId, messages) {
    return this.request('/v3/conversation/add', {
      ...this.isolation(sessionId),
      session_id: sessionId,
      messages,
    }, this.config.writeTimeoutMs)
  }

  async recall(query, sessionId = '') {
    const [atomic, core, scenarios, conversations] = await Promise.allSettled([
      this.searchAtomic(query, this.config.recallLimit),
      this.readCore(),
      this.listScenarios(),
      this.searchConversation(query, this.config.recallLimit),
    ])
    const sections = []
    if (atomic.status === 'fulfilled' && Array.isArray(atomic.value?.items) && atomic.value.items.length) {
      const lines = atomic.value.items.map(item => `- [${item.type || 'memory'}] ${trimText(item.content, this.config.maxMemoryChars)}`)
      sections.push(`<relevant-memories>\n${lines.join('\n')}\n</relevant-memories>`)
    }
    if (core.status === 'fulfilled' && core.value?.content) {
      sections.push(`<user-core>\n${trimText(core.value.content, Math.floor(this.config.maxContextChars * 0.55))}\n</user-core>`)
    }
    if (scenarios.status === 'fulfilled' && Array.isArray(scenarios.value?.entries) && scenarios.value.entries.length) {
      const lines = scenarios.value.entries.slice(0, 30).map(item => `- ${item.path}${item.summary ? ` — ${trimText(item.summary, 300)}` : ''}`)
      sections.push(`<scene-navigation>\n${lines.join('\n')}\n</scene-navigation>`)
    }
    if (conversations.status === 'fulfilled' && Array.isArray(conversations.value?.messages)) {
      const lines = conversations.value.messages.map(item => `- [${item.role || 'message'}] ${trimText(item.content, this.config.maxMemoryChars)}`)
      if (lines.length) sections.push(`<recent-conversations>\n${lines.join('\n')}\n</recent-conversations>`)
    }
    const context = sections.join('\n\n')
    return {
      context: trimText(context, this.config.maxContextChars),
      partialFailures: [atomic, core, scenarios, conversations].filter(result => result.status === 'rejected').length,
    }
  }
}
