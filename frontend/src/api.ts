const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const auth = {
  get: () => localStorage.getItem('token'),
  role: () => localStorage.getItem('role') || 'admin',
  username: () => localStorage.getItem('username') || '',
  set: (t: string) => localStorage.setItem('token', t),
  setUser: (username: string, role: string) => {
    localStorage.setItem('username', username);
    localStorage.setItem('role', role);
  },
  clear: () => { localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('username'); },
};

async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = auth.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau ít giây.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/auth/login') { auth.clear(); window.dispatchEvent(new Event('logout')); }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Lỗi ${res.status}`);
  return data as T;
}

export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, b?: unknown) => req<T>(p, 'POST', b ?? {}),
  put: <T,>(p: string, b: unknown) => req<T>(p, 'PUT', b),
  del: <T,>(p: string) => req<T>(p, 'DELETE'),
};
