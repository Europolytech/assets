/**
 * Dependency-free Supabase Auth + PostgREST client for this personal invoice utility.
 * Financial records stay on the server. Only auth session tokens are cached locally.
 */
const SESSION_KEY = 'abInvoiceAuthSessionV1';
export function createClient(projectUrl, publishableKey) {
  const base = projectUrl.replace(/\/$/, '');
  let session = null;
  const listeners = new Set();
  let refreshing = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { localStorage.removeItem(SESSION_KEY); }
  function setSession(next, event = 'SIGNED_IN') {
    session = next;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
    listeners.forEach(fn => { try { fn(event, session); } catch(e) { console.error(e); } });
  }
  function parseError(resp, value) {
    return new Error(value?.msg || value?.message || value?.error_description || value?.error || ('HTTP ' + resp.status));
  }
  async function request(path, options = {}, bearer = null) {
    const headers = {
      apikey: publishableKey,
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...options.headers
    };
    let resp;
    try { resp = await fetch(base + path, { ...options, headers, mode: 'cors' }); }
    catch (e) { return { data: null, error: new Error('Could not reach Supabase: ' + e.message) }; }
    const raw = await resp.text();
    let value = null;
    try { value = raw ? JSON.parse(raw) : null; }
    catch { value = raw; }
    return resp.ok ? { data: value, error: null } : { data: null, error: parseError(resp, value) };
  }
  function saveAuthResponse(data) {
    if (!data?.access_token || !data?.refresh_token) throw new Error('Authentication response is missing session tokens');
    const expires = data.expires_at || (Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600));
    setSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expires, user: data.user || session?.user || null });
  }
  async function freshSession() {
    if (!session?.access_token) return null;
    const seconds = Math.floor(Date.now() / 1000);
    if (Number(session.expires_at) > seconds + 60) return session;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      if (!session?.refresh_token) { setSession(null, 'SIGNED_OUT'); return null; }
      const result = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (result.error) {
        if (!result.error.message.startsWith('Could not reach')) setSession(null, 'SIGNED_OUT');
        throw result.error;
      }
      saveAuthResponse(result.data);
      return session;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }
  async function acceptAuthRedirect() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('error')) {
      const message = hash.get('error_description') || hash.get('error');
      history.replaceState(null, '', location.pathname + location.search);
      throw new Error('Email sign-in failed: ' + message);
    }
    if (hash.get('access_token')) {
      saveAuthResponse({
        access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'),
        expires_in: hash.get('expires_in'), expires_at: hash.get('expires_at')
      });
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  async function getSession() {
    try {
      await acceptAuthRedirect();
      const current = await freshSession();
      if (!current) return { data: { session: null }, error: null };
      if (!current.user) {
        const user = await request('/auth/v1/user', { method: 'GET' }, current.access_token);
        if (user.error) throw user.error;
        session.user = user.data;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
      return { data: { session }, error: null };
    } catch (error) { return { data: { session: null }, error }; }
  }
  const auth = {
    getSession,
    async signInWithOtp({ email, options = {} }) {
      if (!email || !email.includes('@')) return { data: null, error: new Error('Enter a valid email address') };
      const redirect = options.emailRedirectTo || location.origin + location.pathname;
      return request('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), {
        method: 'POST', body: JSON.stringify({ email, create_user: true })
      });
    },
    onAuthStateChange(callback) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    async signOut() {
      if (session?.access_token) await request('/auth/v1/logout', { method: 'POST' }, session.access_token);
      setSession(null, 'SIGNED_OUT');
      return { error: null };
    }
  };
  async function tableRequest(table, method, query, body, extra = {}) {
    try {
      const userSession = await freshSession();
      if (!userSession) return { data: null, error: new Error('Sign in to access cloud records') };
      const opts = { method, headers: extra, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
      return request('/rest/v1/' + encodeURIComponent(table) + query, opts, userSession.access_token);
    } catch (error) { return { data: null, error }; }
  }
  function from(table) {
    return {
      select(columns) {
        const query = new URLSearchParams({ select: columns });
        let sort = null, range = null;
        const op = {
          order(field, { ascending = true } = {}) { sort = field + '.' + (ascending ? 'asc' : 'desc'); return op; },
          range(from, to) { range = [from, to]; return op; },
          then(resolve, reject) {
            if (sort) query.set('order', sort);
            if (range) { query.set('offset', String(range[0])); query.set('limit', String(range[1] - range[0] + 1)); }
            return tableRequest(table, 'GET', '?' + query.toString()).then(resolve, reject);
          }
        };
        return op;
      },
      insert(rows) { return tableRequest(table, 'POST', '', rows, { Prefer: 'return=minimal' }); },
      upsert(row, { onConflict = 'id' } = {}) {
        return tableRequest(table, 'POST', '?on_conflict=' + encodeURIComponent(onConflict), row,
          { Prefer: 'resolution=merge-duplicates,return=minimal' });
      }
    };
  }
  return { auth, from };
}
