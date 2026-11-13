import { useEffect, useState, type ReactElement } from 'react';
import { api, auth } from './api';
import { DataProvider, useData } from './data';
import * as P from './pages';
import logo from './assets/logo.svg';
import './App.css';

const NAV: [string, string][] = [
  ['dashboard', 'Tổng quan'], ['employees', 'Quản lý nhân viên'], ['emp-form', 'Thêm nhân viên'], ['departments', 'Phòng ban'],
  ['attendance', 'Chấm công'], ['leave', 'Nghỉ phép'], ['payroll', 'Tiền lương'], ['performance', 'Đánh giá nhân viên'],
  ['recruitment', 'Tuyển dụng'], ['training', 'Đào tạo'], ['reports', 'Báo cáo – Thống kê'],
  ['notifications', 'Thông báo'], ['settings', 'Cài đặt & Phân quyền'],
];

function useHash() {
  const [h, setH] = useState(location.hash.slice(1));
  useEffect(() => { const f = () => setH(location.hash.slice(1)); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}

function Login({ onOk }: { onOk: () => void }) {
  const [u, setU] = useState(''), [pw, setPw] = useState(''), [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!u.trim() || !pw) return alert('Vui lòng nhập tài khoản và mật khẩu');
    setBusy(true);
    try {
      const r = await api.post<{ token: string; username: string; role: string }>('/api/auth/login', { username: u.trim(), password: pw });
      auth.set(r.token); auth.setUser(r.username, r.role); onOk();
    }
    catch (e) { alert(e instanceof Error ? e.message : 'Đăng nhập thất bại'); }
    setBusy(false);
  };
  return (
    <div className="login card">
      <div className="logo" style={{ paddingLeft: 0 }}>Coral HR</div>
      <p style={{ color: 'var(--mu)' }}>Đăng nhập hệ thống quản lý nhân sự</p>
      <input placeholder="Tài khoản" aria-label="Tài khoản" autoComplete="username" value={u} onChange={e => setU(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submit()} />
      <input type="password" placeholder="Mật khẩu" aria-label="Mật khẩu" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submit()} />
      <button style={{ width: '100%' }} disabled={busy} onClick={() => void submit()}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
    </div>
  );
}

function Shell({ page, param, onLogout }: { page: string; param: string; onLogout: () => void }) {
  const { loading, loaded, error, reload, notifications } = useData();
  const role = auth.role();
  const canManageUsers = role === 'admin';
  const canEdit = role !== 'viewer';
  const [user, setUser] = useState(localStorage.getItem('user') || 'Admin');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || '');
  useEffect(() => { if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme; }, [theme]);

  const pages: Record<string, ReactElement> = {
    dashboard: <P.Dashboard user={user} />, employees: <P.Employees />, 'emp-form': <P.EmployeeForm key={param || 'new'} id={Number(param) || 0} />,
    departments: <P.Departments />, attendance: <P.AttendancePage />, leave: <P.LeavePage />,
    payroll: <P.Payroll />, performance: <P.Performance />, recruitment: <P.Recruitment />,
    training: <P.TrainingPage />, reports: <P.Reports />, notifications: <P.Notifications />,
    settings: <P.Settings user={user} theme={theme} onSave={(u, t) => { localStorage.setItem('user', u); localStorage.setItem('theme', t); setUser(u); setTheme(t); }} onLogout={onLogout} />,
  };
  const visibleNav = NAV.filter(([key]) => (key !== 'settings' || canManageUsers) && (key !== 'emp-form' || canEdit));
  const unread = notifications.filter(n => !n.read_at).length;
  return (
    <div className="app">
      <aside>
        <div className="logo"><img src={logo} alt="" style={{ height: 22, verticalAlign: 'middle', marginRight: 8 }} />Coral HR</div>
        {visibleNav.map(([k, l]) => <a key={k} href={`#${k}`} className={k === page ? 'on' : ''}>{l}{k === 'notifications' && unread > 0 ? ` (${unread})` : ''}</a>)}
      </aside>
      <main>
        {loading ? <p>Đang tải dữ liệu...</p> : error && !loaded
          ? <div className="card"><h3>Không kết nối được máy chủ</h3><p>{error}</p><button onClick={() => void reload()}>Thử lại</button></div>
          : <>
            {error && <div className="card"><b>Không làm mới được dữ liệu:</b> {error} <button className="sm" onClick={() => void reload()}>Thử lại</button></div>}
            {!canManageUsers && page === 'settings' ? <div className="card">Bạn không có quyền truy cập mục này.</div>
              : !canEdit && page === 'emp-form' ? <div className="card">Tài khoản chỉ có quyền xem.</div>
                : pages[page] ?? pages.dashboard}
          </>}
      </main>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!auth.get());
  const hash = useHash();
  const [page, param = ''] = (hash || 'dashboard').split('/');

  useEffect(() => { const f = () => setAuthed(false); window.addEventListener('logout', f); return () => window.removeEventListener('logout', f); }, []);
  const logout = () => { auth.clear(); setAuthed(false); location.hash = ''; };

  if (!authed) return <Login onOk={() => { setAuthed(true); location.hash = 'dashboard'; }} />;
  return <DataProvider><Shell page={page} param={param} onLogout={logout} /></DataProvider>;
}
