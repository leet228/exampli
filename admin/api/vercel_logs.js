// Proxy: fetch recent logs/events from Vercel for the main project
// ENV required:
//  - VERCEL_TOKEN: personal/team token with read access
//  - VERCEL_PROJECT_ID or VERCEL_PROJECT: project id or name
//  - VERCEL_TEAM_ID (optional)
export default async function handler(req, res) {
  try {
    const token = process.env.VERCEL_TOKEN
    const qProject = (req.query?.project || req.query?.projectId || '').toString().trim()
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
    const now = Date.now()
    const sinceMs = range === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : now - 24 * 60 * 60 * 1000
    const untilMs = now

    // 1) find latest READY deployment for the project
    const depIdOverride = (req.query?.deploymentId || '').toString().trim()
    const dep = depIdOverride ? { uid: depIdOverride, url: undefined, createdAt: undefined } : await getLatestDeployment({ token, projectId, teamId })
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
    ]
    const headers = { Authorization: `Bearer ${token}` }
    const withTeam = (url) => (teamId ? (url.includes('?') ? `${url}&teamId=${encodeURIComponent(teamId)}` : `${url}?teamId=${encodeURIComponent(teamId)}`) : url)

    let payload = null
    const attempts = []
    for (const rawUrl of candidates) {
      const url = withTeam(rawUrl)
      try {
        const r = await fetch(url, { headers })
        attempts.push({ url: rawUrl, status: r.status })
        if (!r.ok) continue
        const j = await r.json().catch(() => null)
        if (!j) continue
        payload = j
        break
      } catch {}
    }

    if (!payload) {
      res.status(501).json({ error: 'logs_endpoint_unavailable', details: 'No compatible Vercel logs endpoint responded OK', debug: { attempted: attempts, deployment: dep?.uid || null } })
      return
    }

    const rows = normalizeLogs(payload)
    const wantSummary = String(req.query?.summary || '').toLowerCase() === '1' || String(req.query?.summary || '').toLowerCase() === 'true'
    const summary = wantSummary ? computeSummary(rows) : undefined
    res.status(200).json({ ok: true, deployment: { id: dep.uid, url: dep.url, createdAt: dep.createdAt }, range, since: new Date(sinceMs).toISOString(), until: new Date(untilMs).toISOString(), rows, summary })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'vercel_logs_internal' })
  }
}

async function getLatestDeployment({ token, projectId, teamId }) {
  const headers = { Authorization: `Bearer ${token}` }
  const qs = new URLSearchParams({ limit: '5' })
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
      const ready = list.find((d) => d?.readyState === 'READY' || d?.state === 'READY' || d?.readyState === 'READY') || list[0]
      if (ready) return ready
    } catch {}
  }
  return null
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

function normalizeLogs(payload) {
  // Different endpoints return different shapes; try to normalize
  const out = []
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


