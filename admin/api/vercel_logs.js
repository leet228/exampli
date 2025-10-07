// Proxy: fetch recent logs/events from Vercel for the main project
// ENV required:
//  - VERCEL_TOKEN: personal/team token with read access
//  - VERCEL_PROJECT_ID or VERCEL_PROJECT: project id or name
//  - VERCEL_TEAM_ID (optional)
export default async function handler(req, res) {
  try {
    const token = process.env.VERCEL_TOKEN
    const qProject = (req.query?.project || req.query?.projectId || '').toString().trim()
    const qDomain = (req.query?.domain || '').toString().trim()
    let projectId = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT
    // Allow overriding project by query (name or id)
    if (qProject) {
      const resolved = await resolveProjectId({ token, teamId: process.env.VERCEL_TEAM_ID || undefined, query: qProject })
      if (resolved) projectId = resolved
      else projectId = qProject // if API fails but value is already an ID, downstream may still work
    }
    const teamId = process.env.VERCEL_TEAM_ID || undefined
    if (!token || !projectId) {
      res.status(500).json({ error: 'vercel_env_missing', hint: 'Set VERCEL_TOKEN and VERCEL_PROJECT_ID' });
      return
    }

    const range = (req.query?.range || '24h').toString()
    const wantDebug = String(req.query?.debug || '').toLowerCase() === '1' || String(req.query?.debug || '').toLowerCase() === 'true'
    const now = Date.now()
    const sinceMs = range === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : now - 24 * 60 * 60 * 1000
    const untilMs = now

    // 1) pick deployment: prefer current by domain alias, then explicit id, then latest READY production
    const depIdOverride = (req.query?.deploymentId || '').toString().trim()
    let dep = null
    if (qDomain) dep = await getDeploymentByDomain({ token, teamId, domain: qDomain })
    if (!dep && depIdOverride) dep = { uid: depIdOverride, url: undefined, createdAt: undefined }
    if (!dep) dep = await getLatestDeployment({ token, projectId, teamId })
    if (!dep?.uid) {
      res.status(500).json({ error: 'deployment_not_found' })
      return
    }

    // 2) try to fetch events/logs for the deployment from several known endpoints
    const candidates = [
      // Deployment events (various API versions + params variants)
      `https://api.vercel.com/v13/deployments/${dep.uid}/events?limit=1000&since=${sinceMs}&until=${untilMs}`,
      `https://api.vercel.com/v13/deployments/${dep.uid}/events?limit=1000&from=${sinceMs}&to=${untilMs}`,
      `https://api.vercel.com/v12/deployments/${dep.uid}/events?limit=1000&since=${sinceMs}&until=${untilMs}`,
      `https://api.vercel.com/v12/deployments/${dep.uid}/events?limit=1000&from=${sinceMs}&to=${untilMs}`,
      `https://api.vercel.com/v6/deployments/${dep.uid}/events?limit=1000&since=${sinceMs}&until=${untilMs}`,
      `https://api.vercel.com/v6/deployments/${dep.uid}/events?limit=1000&from=${sinceMs}&to=${untilMs}`,
      `https://api.vercel.com/v2/deployments/${dep.uid}/events?limit=1000&since=${sinceMs}&until=${untilMs}`,
      `https://api.vercel.com/v2/deployments/${dep.uid}/events?limit=1000&from=${sinceMs}&to=${untilMs}`,
      `https://api.vercel.com/v1/deployments/${dep.uid}/events?limit=1000&since=${sinceMs}&until=${untilMs}`,
      // Functions logs
      `https://api.vercel.com/v2/deployments/${dep.uid}/functions/logs?since=${sinceMs}&until=${untilMs}&limit=1000`,
      // Observability (new logs API variants)
      `POST:https://api.vercel.com/v1/observability/query`,
      `GET:https://api.vercel.com/v1/observability/logs?deploymentId=${dep.uid}&from=${sinceMs}&to=${untilMs}&limit=1000`,
    ]
    const headers = { Authorization: `Bearer ${token}` }
    const withTeam = (url) => (teamId ? (url.includes('?') ? `${url}&teamId=${encodeURIComponent(teamId)}` : `${url}?teamId=${encodeURIComponent(teamId)}`) : url)

    let payload = null
    const attempts = []
    let lastOk = { url: null, method: null }
    for (const raw of candidates) {
      try {
        let method = 'GET'
        let url = raw
        if (raw.startsWith('POST:')) { method = 'POST'; url = raw.slice(5) }
        if (raw.startsWith('GET:')) { method = 'GET'; url = raw.slice(4) }
        url = withTeam(url)
        let r = null
        if (method === 'POST' && url.includes('/observability/query')) {
          // Try several query shapes for compatibility
          const bodies = [
            { query: `from logs select timestamp, level, message, path, status where deploymentId = '${dep.uid}' and timestamp >= ${sinceMs} and timestamp <= ${untilMs} order by timestamp desc limit 1000` },
            { query: `from logs where deploymentId = '${dep.uid}' and timestamp >= ${sinceMs} and timestamp <= ${untilMs} limit 1000` },
            { query: `from logs select * where deploymentId = '${dep.uid}' and timestamp >= ${sinceMs} and timestamp <= ${untilMs} limit 1000` },
          ]
          for (const b of bodies) {
            r = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
            attempts.push({ url: 'POST ' + url, status: r.status, ct: r.headers.get('content-type') || null })
            if (!r.ok) continue
            const j = await parseBody(r)
            if (j == null) continue
            payload = j
            lastOk = { url, method }
            break
          }
          if (payload) break
        } else {
          r = await fetch(url, { headers })
          attempts.push({ url: method + ' ' + url, status: r.status, ct: r.headers.get('content-type') || null })
          if (!r.ok) continue
          const j = await parseBody(r)
          if (j == null) continue
          payload = j
          lastOk = { url, method }
          break
        }
      } catch {}
    }

    if (!payload) {
      res.status(501).json({ error: 'logs_endpoint_unavailable', details: 'No compatible Vercel logs endpoint responded OK', debug: { attempted: attempts, deployment: dep?.uid || null } })
      return
    }

    const rows = normalizeLogs(payload)
    const wantSummary = String(req.query?.summary || '').toLowerCase() === '1' || String(req.query?.summary || '').toLowerCase() === 'true'
    const summary = wantSummary ? computeSummary(rows) : undefined
    const debug = wantDebug ? buildDebug(payload, attempts, lastOk) : undefined
    res.status(200).json({ ok: true, deployment: { id: dep.uid, url: dep.url, createdAt: dep.createdAt }, range, since: new Date(sinceMs).toISOString(), until: new Date(untilMs).toISOString(), rows, summary, debug })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'vercel_logs_internal' })
  }
}

async function getLatestDeployment({ token, projectId, teamId }) {
  const headers = { Authorization: `Bearer ${token}` }
  const qs = new URLSearchParams({ limit: '5', target: 'production' })
  if (projectId) qs.set('projectId', projectId)
  if (teamId) qs.set('teamId', teamId)
  // Try newer and older versions for better compatibility
  const urls = [
    `https://api.vercel.com/v13/deployments?${qs.toString()}`,
    `https://api.vercel.com/v6/deployments?${qs.toString()}`,
  ]
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers })
      if (!r.ok) continue
      const j = await r.json()
      const list = Array.isArray(j?.deployments) ? j.deployments : Array.isArray(j) ? j : []
      const sorted = list.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0))
      const ready = sorted.find((d) => (d?.readyState === 'READY' || d?.state === 'READY')) || sorted[0]
      if (ready) return ready
    } catch {}
  }
  return null
}

async function getDeploymentByDomain({ token, teamId, domain }) {
  try {
    const headers = { Authorization: `Bearer ${token}` }
    const withTeam = (url) => (teamId ? (url.includes('?') ? `${url}&teamId=${encodeURIComponent(teamId)}` : `${url}?teamId=${encodeURIComponent(teamId)}`) : url)
    // 1) resolve alias -> deploymentId
    const aliasUrls = [
      `https://api.vercel.com/v2/aliases/${encodeURIComponent(domain)}`,
      `https://api.vercel.com/v6/aliases/${encodeURIComponent(domain)}`,
      `https://api.vercel.com/v4/aliases/${encodeURIComponent(domain)}`,
    ]
    let deploymentId = null
    for (const raw of aliasUrls) {
      try {
        const r = await fetch(withTeam(raw), { headers })
        if (!r.ok) continue
        const j = await r.json().catch(() => null)
        deploymentId = j?.deploymentId || j?.deployment?.id || j?.deployment || null
        if (deploymentId) break
      } catch {}
    }
    if (!deploymentId) return null
    // 2) fetch details of that deployment
    const depUrls = [
      `https://api.vercel.com/v13/deployments/${deploymentId}`,
      `https://api.vercel.com/v6/deployments/${deploymentId}`,
    ]
    for (const raw of depUrls) {
      try {
        const r = await fetch(withTeam(raw), { headers })
        if (!r.ok) continue
        const j = await r.json().catch(() => null)
        if (j?.uid || j?.id) return { uid: j.uid || j.id, url: j.url, createdAt: j.createdAt }
      } catch {}
    }
    return { uid: deploymentId }
  } catch {
    return null
  }
}

async function resolveProjectId({ token, teamId, query }) {
  try {
    if (!query) return null
    // If looks like an id (uuid-like), return as is
    if (/^[a-zA-Z0-9]{20,}$/.test(query) || /[0-9a-fA-F-]{24,}/.test(query)) return query
    const headers = { Authorization: `Bearer ${token}` }
    const withTeam = (url) => (teamId ? (url.includes('?') ? `${url}&teamId=${encodeURIComponent(teamId)}` : `${url}?teamId=${encodeURIComponent(teamId)}`) : url)
    const urls = [
      `https://api.vercel.com/v13/projects/${encodeURIComponent(query)}`,
      `https://api.vercel.com/v10/projects/${encodeURIComponent(query)}`,
      `https://api.vercel.com/v9/projects/${encodeURIComponent(query)}`,
      `https://api.vercel.com/v8/projects/${encodeURIComponent(query)}`,
    ]
    for (const raw of urls) {
      try {
        const r = await fetch(withTeam(raw), { headers })
        if (!r.ok) continue
        const j = await r.json().catch(() => null)
        const id = j?.id || j?.project?.id
        if (id) return id
      } catch {}
    }
  } catch {}
  return null
}

async function parseBody(r) {
  try {
    // Prefer JSON
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) return await r.json()
    // Try text with NDJSON
    const text = await r.text()
    if (!text) return null
    // If looks like JSON
    const trimmed = text.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { return JSON.parse(trimmed) } catch {}
    }
    // Parse NDJSON -> array
    const lines = trimmed.split(/\r?\n/).filter(Boolean)
    const arr = []
    for (const ln of lines) {
      try { arr.push(JSON.parse(ln)) } catch { arr.push({ message: ln }) }
    }
    return arr
  } catch {
    return null
  }
}

function normalizeLogs(payload) {
  // Different endpoints return different shapes; try to normalize
  const out = []
  // Raw array (e.g., NDJSON parsed to array of objects)
  if (Array.isArray(payload)) {
    for (const row of payload) {
      const ts = row?.timestamp || row?.time || row?.ts || row?._time
      const level = row?.level || row?.severity || row?.type || 'info'
      const msg = row?.message || row?.msg || row?.text || safeString(row)
      out.push({ ts: toIso(ts), level: String(level), source: row?.source || 'log', message: msg, path: row?.path || row?.url || null, status: row?.status || row?.code || null })
    }
  }
  // Observability query result
  if (Array.isArray(payload?.data)) {
    for (const row of payload.data) {
      const ts = row.timestamp || row.ts || row.time || row._time
      out.push({
        ts: toIso(ts),
        level: (row.level || row.severity || 'info').toString(),
        source: row.source || 'log',
        message: row.message || row.msg || safeString(row),
        path: row.path || row.url || null,
        status: row.status || row.code || null,
      })
    }
  }
  if (Array.isArray(payload?.events)) {
    for (const e of payload.events) {
      out.push({
        ts: toIso(e?.createdAt || e?.created || e?.ts || e?.timestamp),
        level: e?.severity || e?.level || 'info',
        source: e?.type || e?.category || 'event',
        message: e?.message || e?.text || e?.payload?.message || safeString(e?.payload),
        path: e?.path || e?.route || e?.payload?.path || e?.payload?.url || null,
        status: e?.status || e?.payload?.statusCode || null,
      })
    }
  } else if (Array.isArray(payload?.logs)) {
    for (const l of payload.logs) {
      out.push({
        ts: toIso(l?.createdAt || l?.timestamp),
        level: l?.level || 'info',
        source: l?.type || 'log',
        message: l?.message || l?.text || safeString(l?.payload),
        path: l?.path || null,
        status: l?.status || null,
      })
    }
  }
  // newest first
  out.sort((a, b) => (a.ts > b.ts ? -1 : 1))
  // clamp reasonable amount
  return out.slice(0, 500)
}

function toIso(v) {
  const n = typeof v === 'number' ? v : Number(v || 0)
  if (Number.isFinite(n) && n > 0 && n < 1e13) return new Date(n).toISOString()
  return new Date().toISOString()
}

function computeSummary(rows) {
  let total = 0
  let errors = 0
  for (const r of rows || []) {
    total += 1
    const lvl = String(r.level || '').toLowerCase()
    const status = Number(r.status || 0)
    const isErrorLevel = lvl.includes('error') || lvl.includes('critical')
    const isHttpError = Number.isFinite(status) && status >= 500
    if (isErrorLevel || isHttpError) errors += 1
  }
  const errorRate = total > 0 ? errors / total : 0
  return { total, errors, errorRate }
}

function safeString(v) {
  try {
    if (v == null) return ''
    if (typeof v === 'string') return v
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

function buildDebug(payload, attempts, lastOk) {
  const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 10) : []
  const size = payload ? JSON.stringify(payload).length : 0
  return { attempts, lastOk, payloadShape: keys, payloadSize: size }
}


