import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'anon-test-key';

const { loginUser, logoutUser, ensureFreshSession, persistImageHistory } = await import('../src/lib/authService.js');
const { requireSession } = await import('../src/lib/supabaseClient.js');

const createMockClient = ({
  session,
  signInError,
  signOutError,
  getSessionError,
  refreshSessionResponse,
  upsertError,
} = {}) => {
  const resolvedSession = typeof session === 'undefined'
    ? { user: { id: 'user-1' }, expires_at: Math.floor(Date.now() / 1000) + 60 }
    : session;
  return {
    auth: {
      signInWithPassword: async () => (signInError
        ? { data: null, error: new Error(signInError) }
        : { data: { session: resolvedSession }, error: null }),
      signUp: async () => ({ data: { session: resolvedSession }, error: null }),
      signOut: async () => ({ error: signOutError ? new Error(signOutError) : null }),
      getSession: async () => ({ data: { session: resolvedSession }, error: getSessionError ? new Error(getSessionError) : null }),
      refreshSession: async () => refreshSessionResponse || { data: { session: resolvedSession }, error: null },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      upsert: async () => ({ data: [], error: upsertError ? new Error(upsertError) : null }),
      delete: () => ({ eq: () => ({ error: null }) }),
      select: async () => ({ data: [], error: null }),
      eq() {
        return { error: null };
      },
    }),
  };
};

test('loginUser resolves with session data', async () => {
  const mockSession = { user: { id: 'user-42' }, expires_at: Math.floor(Date.now() / 1000) + 120 };
  const client = createMockClient({ session: mockSession });
  const result = await loginUser('demo@example.com', 'secret', client);
  assert.ok(result.data.session);
  assert.equal(result.data.session.user.id, 'user-42');
});

test('logoutUser delegates to Supabase auth', async () => {
  let called = false;
  const client = createMockClient();
  client.auth.signOut = async () => {
    called = true;
    return { error: null };
  };
  await logoutUser(client);
  assert.ok(called);
});

test('ensureFreshSession returns current session when valid', async () => {
  const session = { user: { id: 'active-user' }, expires_at: Math.floor(Date.now() / 1000) + 300 };
  const client = createMockClient({ session });
  const result = await ensureFreshSession(client);
  assert.equal(result.user.id, 'active-user');
});

test('ensureFreshSession throws when token expired and refresh fails', async () => {
  const expired = { user: { id: 'expired-user' }, expires_at: Math.floor(Date.now() / 1000) - 10 };
  const refreshResponse = { data: { session: null }, error: new Error('refresh failed') };
  const client = createMockClient({ session: expired, refreshSessionResponse: refreshResponse });
  await assert.rejects(() => ensureFreshSession(client), /セッションの有効期限が切れました/);
});

test('requireSession propagates Supabase errors', async () => {
  const client = createMockClient({ getSessionError: 'network error' });
  await assert.rejects(() => requireSession(client), /network error/);
});

test('requireSession rejects when no active session', async () => {
  const client = createMockClient({ session: null });
  await assert.rejects(() => requireSession(client), /ログインが必要/);
});

test('persistImageHistory surfaces failures', async () => {
  const session = { user: { id: 'uploader' }, expires_at: Math.floor(Date.now() / 1000) + 60 };
  const client = createMockClient({ session, upsertError: 'insert failed' });
  await assert.rejects(() => persistImageHistory({ id: 'img-1', prompt: 'test prompt', createdAt: new Date().toISOString() }, client), /insert failed/);
});
