const proxyReportCache = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const SUPABASE_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const authBearer = (process.env.VITE_AUTHORIZATION || process.env.AUTHORIZATION || '').trim();
  const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

  const supaHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const { action, type, from, to, drawId, id, token, username } = req.query || {};

  if (!isSupabaseConfigured && action && ['get_matrix', 'get_commissions', 'get_users', 'save_matrix', 'save_commissions', 'save_user', 'delete_user', 'create_session', 'revoke_session'].includes(action)) {
    if (action === 'get_matrix') return res.status(200).json({ success: true, config: null });
    if (action === 'get_commissions') return res.status(200).json({ success: true, settings: null });
    if (action === 'get_users') return res.status(200).json({ success: true, data: [] });
    return res.status(200).json({ success: true, inMemoryOnly: true, warning: 'Supabase credentials not configured in Vercel environment variables' });
  }

  if (action === 'boot') {
    if (!isSupabaseConfigured) {
      return res.status(200).json({
        success: true,
        matrix: null,
        commissions: null,
        users: [],
        sessionUser: null,
      });
    }
    try {
      const [matrixRes, commRes, usersRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config?id=eq.matrix_config&select=config`, { headers: supaHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config?id=eq.commissions_config&select=config`, { headers: supaHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/rbac_users?select=*&order=created_at.desc`, { headers: supaHeaders }),
      ]);
      const matrixData = await matrixRes.json();
      const commData = await commRes.json();
      const usersData = await usersRes.json();

      let sessionUser = null;
      if (token) {
        const sesRes = await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config?id=eq.active_sessions&select=config`, { headers: supaHeaders });
        const sesData = await sesRes.json();
        if (sesData?.[0]?.config?.[token]) {
          sessionUser = sesData[0].config[token];
        }
      }

      return res.status(200).json({
        success: true,
        matrix: matrixData?.[0]?.config || null,
        commissions: commData?.[0]?.config || null,
        users: Array.isArray(usersData) ? usersData : [],
        sessionUser,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'get_matrix') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config?id=eq.matrix_config&select=config`, { headers: supaHeaders });
      const data = await r.json();
      return res.status(200).json({ success: true, config: data?.[0]?.config || null });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'get_commissions') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config?id=eq.commissions_config&select=config`, { headers: supaHeaders });
      const data = await r.json();
      return res.status(200).json({ success: true, settings: data?.[0]?.config || null });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'get_users') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rbac_users?select=*&order=created_at.desc`, { headers: supaHeaders });
      const data = await r.json();
      return res.status(200).json({ success: true, data: Array.isArray(data) ? data : [] });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'save_matrix') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config`, {
        method: 'POST',
        headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id: 'matrix_config',
          config: body,
          updated_at: new Date().toISOString(),
        }),
      });
      return res.status(r.status).json({ success: r.ok });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'save_commissions') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config`, {
        method: 'POST',
        headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id: 'commissions_config',
          config: body,
          updated_at: new Date().toISOString(),
        }),
      });
      return res.status(r.status).json({ success: r.ok });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'save_user') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rbac_users`, {
        method: 'POST',
        headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return res.status(r.status).json({ success: r.ok, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'delete_user') {
    try {
      const targetId = id || req.query.id;
      const targetUsername = username || req.query.username;
      let queryParam = '';
      if (targetId && targetUsername) {
        queryParam = `or=(id.eq.${targetId},username.eq.${targetUsername})`;
      } else if (targetId) {
        queryParam = `id=eq.${targetId}`;
      } else if (targetUsername) {
        queryParam = `username=eq.${targetUsername}`;
      }
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rbac_users?${queryParam}`, {
        method: 'DELETE',
        headers: supaHeaders,
      });
      return res.status(r.status).json({ success: r.ok });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'create_session') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const sesRes = await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config?id=eq.active_sessions&select=config`, { headers: supaHeaders });
      const sesData = await sesRes.json();
      const current = sesData?.[0]?.config || {};
      current[body.token] = body;

      await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config`, {
        method: 'POST',
        headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id: 'active_sessions',
          config: current,
          updated_at: new Date().toISOString(),
        }),
      });
      return res.status(200).json({ success: true, session: body });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'revoke_session') {
    try {
      const targetToken = token || (typeof req.body === 'object' ? req.body?.token : null);
      if (targetToken) {
        const sesRes = await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config?id=eq.active_sessions&select=config`, { headers: supaHeaders });
        const sesData = await sesRes.json();
        const current = sesData?.[0]?.config || {};
        delete current[targetToken];

        await fetch(`${SUPABASE_URL}/rest/v1/rbac_matrix_config`, {
          method: 'POST',
          headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            id: 'active_sessions',
            config: current,
            updated_at: new Date().toISOString(),
          }),
        });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'login') {
    try {
      const baseTeller = (process.env.VITE_API_URL || process.env.API_URL || '').trim();
      let derivedLogin = '';
      if (baseTeller) {
        try {
          const parsed = new URL(baseTeller);
          derivedLogin = `${parsed.origin}/api/accountant/login`;
        } catch { }
      }
      const loginEndpoint = (process.env.VITE_LOGIN_API_URL || process.env.LOGIN_API_URL || derivedLogin || '').trim();
      if (!loginEndpoint) {
        return res.status(400).json({
          success: false,
          error: 'Login API URL is not configured in Vercel environment variables (VITE_LOGIN_API_URL or VITE_API_URL)',
        });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const r = await fetch(loginEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  let targetUrl = '';
  const baseTeller = (process.env.VITE_API_URL || process.env.API_URL || '').trim();
  const baseDraw = (process.env.VITE_DRAW_API_URL || process.env.DRAW_API_URL || '').trim();
  const baseOverall = (process.env.VITE_OVERALL_API_URL || process.env.OVERALL_API_URL || '').trim();
  const baseSupervisor = (process.env.VITE_SUPERVISOR_API_URL || process.env.SUPERVISOR_API_URL || '').trim();

  if (type === 'overall') {
    if (!baseOverall) return res.status(400).json({ error: 'Overall API URL (VITE_OVERALL_API_URL) is not configured in environment variables' });
    const u = new URL(baseOverall.includes('?') ? baseOverall : `${baseOverall}?id=${id || 5}`);
    if (from) u.searchParams.set('from', from);
    if (to) u.searchParams.set('to', to);
    if (id) u.searchParams.set('id', id);
    targetUrl = u.toString();
  } else if (type === 'draw') {
    if (!baseDraw) return res.status(400).json({ error: 'Draw API URL (VITE_DRAW_API_URL) is not configured in environment variables' });
    const u = new URL(baseDraw.includes('?') ? baseDraw : `${baseDraw}?id=${id || 5}`);
    if (drawId) u.searchParams.set('drawId', drawId);
    if (from) u.searchParams.set('from', from);
    if (to) u.searchParams.set('to', to);
    if (id) u.searchParams.set('id', id);
    targetUrl = u.toString();
  } else if (type === 'supervisor') {
    if (!baseSupervisor) return res.status(400).json({ error: 'Supervisor API URL (VITE_SUPERVISOR_API_URL) is not configured in environment variables' });
    const u = new URL(baseSupervisor.includes('?') ? baseSupervisor : `${baseSupervisor}?id=${id || 5}`);
    if (from) u.searchParams.set('from', from);
    if (to) u.searchParams.set('to', to);
    if (id) u.searchParams.set('id', id);
    if (drawId) u.searchParams.set('drawId', drawId);
    targetUrl = u.toString();
  } else if (type === 'teller') {
    if (!baseTeller) return res.status(400).json({ error: 'Teller API URL (VITE_API_URL) is not configured in environment variables' });
    const u = new URL(baseTeller.includes('?') ? baseTeller : `${baseTeller}?id=${id || 5}`);
    if (from) u.searchParams.set('from', from);
    if (to) u.searchParams.set('to', to);
    if (id) u.searchParams.set('id', id);
    targetUrl = u.toString();
  }

  if (targetUrl) {
    const cacheKey = targetUrl;
    const cached = proxyReportCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < 15000) {
      return res.status(200).json(cached.data);
    }

    try {
      const headers = {
        Accept: 'application/json',
      };
      const clientAuth = req.headers && (req.headers.authorization || req.headers.Authorization);
      const effectiveAuth = authBearer || clientAuth || '';
      if (effectiveAuth) {
        headers['Authorization'] = effectiveAuth.startsWith('Bearer ') ? effectiveAuth : `Bearer ${effectiveAuth}`;
      }
      const apiRes = await fetch(targetUrl, { headers });
      const data = await apiRes.json();
      if (apiRes.ok && data) {
        proxyReportCache.set(cacheKey, { data, timestamp: now });
      }
      return res.status(apiRes.status).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Serverless proxy request failed' });
    }
  }

  return res.status(400).json({ error: 'Invalid or missing proxy request type/action' });
}
