import { useEffect, useState } from 'react';
import { api, auth } from './api';
import { useData } from './data';
import type { EmployeeInput, Leave, User } from './types';

// ---------- tiện ích ----------
const money = (n: number) => Number(n).toLocaleString('vi-VN') + 'đ';
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hours = (a: string, b: string) => {
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
  const mins = h2 * 60 + m2 - (h1 * 60 + m1);
  return mins < 0 ? '-' : (mins / 60).toFixed(1) + 'h';
};
/** Escape CSV: bọc dấu ngoặc kép khi có , " xuống dòng; chặn công thức Excel (=, +, -, @) trong chữ. */
const csvCell = (v: string | number) => {
  let s = String(v ?? '');
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function download(name: string, rows: (string | number)[][]) {
  const csv = '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Chạy một thao tác gọi API, báo lỗi nếu thất bại, rồi tải lại dữ liệu. */
function useAction() {
  const { reload } = useData();
  return async (fn: () => Promise<unknown>): Promise<boolean> => {
    try { await fn(); await reload(); return true; } catch (e) { alert(e instanceof Error ? e.message : 'Có lỗi xảy ra'); return false; }
  };
}
// Thuế TNCN từ tiền lương theo Luật 109/2025/QH15 (kỳ tính thuế 2026): biểu 5 bậc, giảm trừ bản thân 15,5 triệu/tháng.
// Chưa tính giảm trừ người phụ thuộc (6,2 triệu/người) — cần thêm trường "số người phụ thuộc" nếu muốn.
// Hãy đối chiếu lại với kế toán/văn bản mới nhất trước khi dùng thật.
const PERSONAL_DEDUCTION = 15_500_000;
const BRACKETS: [number, number][] = [[10e6, 0.05], [30e6, 0.1], [60e6, 0.2], [100e6, 0.3], [Infinity, 0.35]];
function pit(taxable: number) {
  let tax = 0, prev = 0;
  for (const [cap, rate] of BRACKETS) { if (taxable > prev) tax += (Math.min(taxable, cap) - prev) * rate; prev = cap; }
  return Math.round(tax);
}
function calcPay(salary: number) {
  const s = Number(salary), al = Math.round(s * 0.05), bh = Math.round(s * 0.105);
  const tx = pit(Math.max(0, s + al - bh - PERSONAL_DEDUCTION));
  return { s, al, bh, tx, net: s + al - bh - tx };
}
/** Nếu nhân viên đang chọn đã bị xóa thì quay về nhân viên đầu tiên. */
const validId = (id: number, list: { id: number }[]) => (list.some(x => x.id === id) ? id : list[0]?.id ?? 0);

function Bars({ data, unit = '' }: { data: [string, number][]; unit?: string }) {
  const m = Math.max(1, ...data.map(x => x[1]));
  return <>{data.map(([l, v]) => (
    <div className="row" key={l}><span className="l">{l}</span><div className="b" style={{ width: `${(v / m) * 60}%` }} /><b>{v}{unit && ' ' + unit}</b></div>
  ))}</>;
}

function LeaveTable({ rows, actions }: { rows: Leave[]; actions?: boolean }) {
  const { emps } = useData(); const run = useAction();
  const name = (id: number) => emps.find(e => e.id === id)?.name ?? '?';
  const set = (id: number, status: string) => run(() => api.put(`/api/leaves/${id}`, { status }));
  const cls = (s: string) => (s === 'Đã duyệt' ? 'ok' : s === 'Từ chối' ? 'er' : 'wa');
  return (
    <div className="tw"><table>
      <thead><tr><th>Nhân viên</th><th>Từ</th><th>Đến</th><th>Lý do</th><th>Trạng thái</th>{actions && <th></th>}</tr></thead>
      <tbody>{rows.map(l => (
        <tr key={l.id}><td>{name(l.eid)}</td><td>{l.from_date}</td><td>{l.to_date}</td><td>{l.reason}</td>
          <td><span className={`tag ${cls(l.status)}`}>{l.status}</span></td>
          {actions && auth.role() !== 'viewer' && <td>{l.status === 'Chờ duyệt' && <>
            <button className="sm s" onClick={() => set(l.id, 'Đã duyệt')}>Duyệt</button>{' '}
            <button className="sm r" onClick={() => set(l.id, 'Từ chối')}>Từ chối</button></>}</td>}
        </tr>))}
        {!rows.length && <tr><td colSpan={6}>Chưa có đơn nghỉ phép</td></tr>}
      </tbody></table></div>
  );
}

// ---------- các trang ----------
export function Dashboard({ user }: { user: string }) {
  const { emps, depts, att, leaves } = useData();
  const stats: [string, number][] = [
    ['Tổng nhân viên', emps.length], ['Đang làm việc', emps.filter(e => e.status === 'Đang làm').length],
    ['Chấm công hôm nay', att.filter(a => a.date === today()).length], ['Đơn chờ duyệt', leaves.filter(l => l.status === 'Chờ duyệt').length],
    ['Phòng ban', depts.length],
  ];
  return <>
    <h1>Xin chào, {user} 👋</h1>
    <div className="grid">{stats.map(([l, v]) => <div className="card stat" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
    <div className="card"><h3>Nhân viên theo phòng ban</h3><Bars data={depts.map(d => [d.name, emps.filter(e => e.dept === d.name).length])} /></div>
    <div className="card"><h3>Đơn nghỉ phép gần đây</h3><LeaveTable rows={leaves.slice(-3)} /></div>
  </>;
}

export function Employees() {
  const { emps, depts } = useData(); const run = useAction();
  const [q, setQ] = useState(''), [fd, setFd] = useState('');
  const rows = emps.filter(e => (e.name + e.email).toLowerCase().includes(q.toLowerCase()) && (!fd || e.dept === fd));
  const del = (id: number) => { if (confirm('Xóa nhân viên này?')) void run(() => api.del(`/api/employees/${id}`)); };
  const exp = () => download('nhan-vien.csv', [['Mã', 'Họ tên', 'Email', 'Phòng ban', 'Chức vụ', 'Lương'], ...emps.map(e => [e.id, e.name, e.email, e.dept, e.pos, e.salary])]);
  return <>
    <h1>Danh sách nhân viên</h1>
    <div className="card">
      <div className="bar">
        <input placeholder="Tìm theo tên, email..." value={q} onChange={e => setQ(e.target.value)} />
        <select value={fd} onChange={e => setFd(e.target.value)}><option value="">Tất cả phòng ban</option>{depts.map(d => <option key={d.id}>{d.name}</option>)}</select>
        {auth.role() !== 'viewer' && <button onClick={() => { location.hash = 'emp-form'; }}>+ Thêm mới</button>}
        <button className="g" onClick={exp}>Xuất CSV</button>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Mã</th><th>Họ tên</th><th>Email</th><th>Phòng ban</th><th>Chức vụ</th><th>Trạng thái</th>{auth.role() !== 'viewer' && <th></th>}</tr></thead>
        <tbody>{rows.map(e => (
          <tr key={e.id}><td>NV{e.id}</td><td>{e.name}</td><td>{e.email}</td><td>{e.dept}</td><td>{e.pos}</td>
            <td><span className={`tag ${e.status === 'Đang làm' ? 'ok' : 'wa'}`}>{e.status}</span></td>
            {auth.role() !== 'viewer' && <td><button className="sm g" onClick={() => { location.hash = `emp-form/${e.id}`; }}>Sửa</button>{' '}
              <button className="sm r" onClick={() => del(e.id)}>Xóa</button></td>}</tr>))}
          {!rows.length && <tr><td colSpan={auth.role() === 'viewer' ? 6 : 7}>Không có dữ liệu</td></tr>}
        </tbody></table></div>
    </div>
  </>;
}

export function EmployeeForm({ id }: { id: number }) {
  const { emps, depts } = useData(); const run = useAction();
  const cur = emps.find(e => e.id === id);
  const [f, setF] = useState<EmployeeInput>(cur ? { ...cur } : {
    name: '', email: '', phone: '', dept: depts[0]?.name ?? '', pos: '', salary: 10000000, gender: 'Nam', status: 'Đang làm', join_date: today(),
  });
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setF(p => ({ ...p, [k]: v }));
  const text = (k: 'name' | 'email' | 'phone' | 'pos', label: string, type = 'text') =>
    <label>{label}<input type={type} value={f[k]} onChange={e => set(k, e.target.value)} /></label>;
  const sel = (k: 'dept' | 'gender' | 'status', label: string, opts: string[]) =>
    <label>{label}<select value={f[k]} onChange={e => set(k, e.target.value)}>{opts.map(o => <option key={o}>{o}</option>)}</select></label>;
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) return alert('Vui lòng nhập họ tên và email hợp lệ');
    if (!(f.salary >= 0)) return alert('Lương không được âm');
    const body = { ...f, name: f.name.trim(), email: f.email.trim() };
    setBusy(true);
    const ok = await run(() => (cur ? api.put(`/api/employees/${cur.id}`, body) : api.post('/api/employees', body)));
    setBusy(false);
    if (ok) location.hash = 'employees';
  };
  if (id && !cur) return <div className="card"><p>Không tìm thấy nhân viên này (có thể đã bị xóa).</p><button onClick={() => { location.hash = 'employees'; }}>Về danh sách</button></div>;
  return <>
    <h1>{cur ? 'Sửa' : 'Thêm'} nhân viên</h1>
    <div className="card">
      <div className="f">
        {text('name', 'Họ tên')}{text('email', 'Email', 'email')}{text('phone', 'Số điện thoại')}
        {sel('dept', 'Phòng ban', depts.map(d => d.name))}{text('pos', 'Chức vụ')}
        <label>Lương cơ bản<input type="number" min={0} value={f.salary} onChange={e => set('salary', Number(e.target.value))} /></label>
        {sel('gender', 'Giới tính', ['Nam', 'Nữ'])}{sel('status', 'Trạng thái', ['Đang làm', 'Nghỉ phép', 'Đã nghỉ'])}
      </div>
      <div className="bar" style={{ marginTop: 14 }}>
        <button disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu...' : 'Lưu'}</button><button className="g" onClick={() => { location.hash = 'employees'; }}>Hủy</button>
      </div>
    </div>
  </>;
}

export function Departments() {
  const { depts, emps } = useData(); const run = useAction();
  const [name, setName] = useState('');
  const add = () => { const v = name.trim(); if (v) void run(async () => { await api.post('/api/departments', { name: v }); setName(''); }); };
  return <>
    <h1>Phòng ban</h1>
    <div className="card">
      {auth.role() !== 'viewer' && <div className="bar"><input placeholder="Tên phòng ban mới" value={name} onChange={e => setName(e.target.value)} /><button onClick={add}>Thêm</button></div>}
      <div className="tw"><table>
        <thead><tr><th>Phòng ban</th><th>Số nhân viên</th><th>Tổng lương</th>{auth.role() !== 'viewer' && <th></th>}</tr></thead>
        <tbody>{depts.map(d => { const m = emps.filter(e => e.dept === d.name); return (
          <tr key={d.id}><td>{d.name}</td><td>{m.length}</td><td>{money(m.reduce((a, e) => a + Number(e.salary), 0))}</td>
            {auth.role() !== 'viewer' && <td><button className="sm r" onClick={() => void run(() => api.del(`/api/departments/${d.id}`))}>Xóa</button></td>}</tr>); })}
        </tbody></table></div>
    </div>
  </>;
}

export function AttendancePage() {
  const { emps, att } = useData(); const run = useAction();
  const [sel, setEid] = useState(emps[0]?.id ?? 0);
  const eid = validId(sel, emps);
  // Ngày giờ do server quyết định, client chỉ gửi mã nhân viên và loại chấm công.
  const check = (type: 'in' | 'out') => run(() => api.post('/api/attendance/check', { eid, type }));
  const name = (id: number) => emps.find(e => e.id === id)?.name ?? '?';
  return <>
    <h1>Chấm công</h1>
    <div className="card">
      <div className="bar">
        <select value={eid} onChange={e => setEid(Number(e.target.value))}>{emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        {auth.role() !== 'viewer' && <><button className="s" onClick={() => void check('in')}>Check-in</button>
          <button onClick={() => void check('out')}>Check-out</button></>}
        <span style={{ color: 'var(--mu)' }}>Hôm nay: {today()}</span>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Ngày</th><th>Nhân viên</th><th>Vào</th><th>Ra</th><th>Giờ làm</th></tr></thead>
        <tbody>{att.slice(0, 15).map(x => (
          <tr key={x.id}><td>{x.date}</td><td>{name(x.eid)}</td><td>{x.time_in || '-'}</td><td>{x.time_out || '-'}</td>
            <td>{x.time_in && x.time_out ? hours(x.time_in, x.time_out) : '-'}</td></tr>))}
          {!att.length && <tr><td colSpan={5}>Chưa có dữ liệu</td></tr>}
        </tbody></table></div>
    </div>
  </>;
}

export function LeavePage() {
  const { emps, leaves } = useData(); const run = useAction();
  const [sel, setEid] = useState(emps[0]?.id ?? 0), [from, setFrom] = useState(today()), [to, setTo] = useState(today()), [reason, setReason] = useState('');
  const eid = validId(sel, emps);
  const send = () => {
    if (!eid) return alert('Chưa có nhân viên nào');
    if (to < from) return alert('Ngày kết thúc phải sau ngày bắt đầu');
    void run(async () => { await api.post('/api/leaves', { eid, from_date: from, to_date: to, reason: reason || '-' }); setReason(''); });
  };
  return <>
    <h1>Nghỉ phép</h1>
    {auth.role() !== 'viewer' && <div className="card"><h3>Tạo đơn mới</h3>
      <div className="bar">
        <select value={eid} onChange={e => setEid(Number(e.target.value))}>{emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        <input placeholder="Lý do" value={reason} onChange={e => setReason(e.target.value)} />
        <button onClick={send}>Gửi đơn</button>
      </div></div>}
    <div className="card"><h3>Danh sách đơn</h3><LeaveTable rows={leaves} actions={auth.role() !== 'viewer'} /></div>
  </>;
}

export function Payroll() {
  const { emps } = useData();
  const [month, setMonth] = useState(today().slice(0, 7));
  const rows = emps.filter(e => e.status !== 'Đã nghỉ').map(e => ({ e, ...calcPay(e.salary) }));
  const exp = () => download(`bang-luong-${month}.csv`, [['Họ tên', 'Lương CB', 'Thực nhận'], ...rows.map(r => [r.e.name, r.s, r.net])]);
  return <>
    <h1>Bảng lương</h1>
    <div className="card">
      <div className="bar">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        <button className="g" onClick={exp}>Xuất CSV</button>
        <span style={{ color: 'var(--mu)' }}>Phụ cấp 5%, bảo hiểm 10,5%, thuế TNCN lũy tiến 5 bậc (giảm trừ bản thân 15,5tr). Lương cố định theo tháng, chưa tính theo ngày công.</span>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Nhân viên</th><th>Lương CB</th><th>Phụ cấp</th><th>Bảo hiểm</th><th>Thuế</th><th>Thực nhận</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.e.id}><td>{r.e.name}</td><td>{money(r.s)}</td><td>{money(r.al)}</td><td>-{money(r.bh)}</td><td>-{money(r.tx)}</td><td><b>{money(r.net)}</b></td></tr>))}
          <tr><td colSpan={5}><b>Tổng chi</b></td><td><b>{money(rows.reduce((a, r) => a + r.net, 0))}</b></td></tr>
        </tbody></table></div>
    </div>
  </>;
}

const STAGES = ['Ứng tuyển', 'Phỏng vấn', 'Đề nghị', 'Đã nhận'];
export function Recruitment() {
  const { cands, jobs } = useData(); const run = useAction();
  const [name, setName] = useState(''), [selJob, setJob] = useState(jobs[0]?.id ?? 0);
  const job = validId(selJob, jobs);
  const add = () => { const v = name.trim(); if (v) void run(async () => { await api.post('/api/candidates', { name: v, job_id: job, stage: 0 }); setName(''); }); };
  const title = (id: number) => jobs.find(j => j.id === id)?.title ?? '';
  return <>
    <h1>Tuyển dụng</h1>
    <div className="card">
      {auth.role() !== 'viewer' && <div className="bar">
        <input placeholder="Tên ứng viên" value={name} onChange={e => setName(e.target.value)} />
        <select value={job} onChange={e => setJob(Number(e.target.value))}>{jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</select>
        <button onClick={add}>Thêm ứng viên</button>
      </div>}
      <div className="kan">{STAGES.map((s, i) => { const list = cands.filter(c => c.stage === i); return (
        <div key={s}><b>{s}</b> <span className="tag">{list.length}</span>
          {list.map(c => (
            <div className="kc" key={c.id}>{c.name}<br /><small style={{ color: 'var(--mu)' }}>{title(c.job_id)}</small>
              {auth.role() !== 'viewer' && <div className="bar" style={{ margin: '6px 0 0' }}>
                {i > 0 && <button className="sm g" onClick={() => void run(() => api.put(`/api/candidates/${c.id}`, { stage: i - 1 }))}>←</button>}
                {i < 3 && <button className="sm" onClick={() => void run(() => api.put(`/api/candidates/${c.id}`, { stage: i + 1 }))}>→</button>}
                <button className="sm r" onClick={() => void run(() => api.del(`/api/candidates/${c.id}`))}>×</button>
              </div>}</div>))}
        </div>); })}</div>
    </div>
  </>;
}

export function Performance() {
  const { emps, reviews } = useData(); const run = useAction();
  return <>
    <h1>Đánh giá hiệu suất</h1>
    <div className="card"><div className="tw"><table>
      <thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Điểm (1-5)</th><th>Xếp loại</th></tr></thead>
      <tbody>{emps.map(e => { const r = reviews[e.id] || 0; return (
        <tr key={e.id}><td>{e.name}</td><td>{e.dept}</td>
          <td>{[1, 2, 3, 4, 5].map(n => (
            <span key={n} style={{ cursor: auth.role() === 'viewer' ? 'default' : 'pointer', fontSize: 20, color: n <= r ? '#f5a623' : 'var(--bd)' }}
              onClick={() => { if (auth.role() !== 'viewer') void run(() => api.put(`/api/reviews/${e.id}`, { score: n })); }}>★</span>))}</td>
          <td>{r >= 4 ? <span className="tag ok">Xuất sắc</span> : r === 3 ? <span className="tag wa">Đạt</span>
            : r ? <span className="tag er">Cần cải thiện</span> : 'Chưa đánh giá'}</td></tr>); })}
      </tbody></table></div></div>
  </>;
}

export function Reports() {
  const { emps, depts, reviews } = useData();
  const scores = Object.values(reviews);
  const avgSalary = Math.round(emps.reduce((a, e) => a + Number(e.salary), 0) / (emps.length || 1));
  const avgScore = (scores.reduce((a, b) => a + b, 0) / (scores.length || 1)).toFixed(1);
  return <>
    <h1>Báo cáo</h1>
    <div className="card"><h3>Quỹ lương theo phòng ban</h3>
      <Bars unit="tr" data={depts.map(d => [d.name, Math.round(emps.filter(e => e.dept === d.name).reduce((a, e) => a + Number(e.salary), 0) / 1e6)])} /></div>
    <div className="card"><h3>Giới tính</h3><Bars data={['Nam', 'Nữ'].map(g => [g, emps.filter(e => e.gender === g).length])} /></div>
    <div className="card"><h3>Chỉ số</h3>Lương trung bình: <b>{money(avgSalary)}</b> · Điểm đánh giá TB: <b>{avgScore}</b></div>
  </>;
}

export function TrainingPage() {
  const { emps, trainings } = useData(); const run = useAction();
  const [eid, setEid] = useState(emps[0]?.id ?? 0);
  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [from, setFrom] = useState(today()), [to, setTo] = useState(today());
  const canEdit = auth.role() !== 'viewer';
  const employeeName = (id: number) => emps.find(e => e.id === id)?.name ?? 'Không rõ';
  const add = () => {
    if (!eid) return alert('Cần có nhân viên trước khi tạo khóa đào tạo');
    if (!title.trim() || to < from) return alert('Nhập tên khóa học và kiểm tra ngày đào tạo');
    void run(async () => {
      await api.post('/api/trainings', { eid, title: title.trim(), description, from_date: from, to_date: to });
      setTitle(''); setDescription('');
    });
  };
  return <>
    <h1>Đào tạo</h1>
    {canEdit && <div className="card">
      <h3>Thêm khóa đào tạo cho nhân viên</h3>
      <div className="bar">
        <select value={eid} onChange={e => setEid(Number(e.target.value))}>
          {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input placeholder="Tên khóa đào tạo" value={title} onChange={e => setTitle(e.target.value)} />
        <input type="date" aria-label="Ngày bắt đầu" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" aria-label="Ngày kết thúc" value={to} onChange={e => setTo(e.target.value)} />
        <input placeholder="Mô tả" value={description} onChange={e => setDescription(e.target.value)} />
        <button disabled={!emps.length} onClick={add}>Thêm khóa</button>
      </div>
    </div>}
    <div className="card"><div className="tw"><table>
      <thead><tr><th>Khóa đào tạo</th><th>Nhân viên</th><th>Từ ngày</th><th>Đến ngày</th><th>Mô tả</th><th>Trạng thái</th>{canEdit && <th></th>}</tr></thead>
      <tbody>{trainings.map(t => <tr key={t.id}>
        <td>{t.title}</td><td>{employeeName(t.eid)}</td><td>{t.from_date}</td><td>{t.to_date}</td><td>{t.description}</td>
        <td>{canEdit
          ? <select value={t.status} onChange={e => void run(() => api.put(`/api/trainings/${t.id}`, { status: e.target.value }))}>
            {['Lên kế hoạch', 'Đang học', 'Hoàn thành'].map(s => <option key={s}>{s}</option>)}
          </select>
          : <span className="tag">{t.status}</span>}</td>
        {canEdit && <td><button className="sm r" onClick={() => {
          if (confirm('Xóa khóa đào tạo này?')) void run(() => api.del(`/api/trainings/${t.id}`));
        }}>Xóa</button></td>}
      </tr>)}
      {!trainings.length && <tr><td colSpan={canEdit ? 7 : 6}>Chưa có khóa đào tạo</td></tr>}
      </tbody></table></div></div>
  </>;
}

export function Notifications() {
  const { notifications } = useData(); const run = useAction();
  const unread = notifications.filter(n => !n.read_at).length;
  return <>
    <h1>Thông báo</h1>
    <div className="card">
      <div className="bar"><span>{unread} thông báo chưa đọc</span>
        {unread > 0 && <button className="g" onClick={() => void run(() => api.post('/api/notifications/read-all'))}>Đánh dấu đã đọc tất cả</button>}
      </div>
      <div className="tw"><table>
        <thead><tr><th>Trạng thái</th><th>Thông báo</th><th>Nội dung</th><th>Thời gian</th><th></th></tr></thead>
        <tbody>{notifications.map(n => <tr key={n.id}>
          <td><span className={`tag ${n.read_at ? '' : 'wa'}`}>{n.read_at ? 'Đã đọc' : 'Mới'}</span></td>
          <td>{n.title}</td><td>{n.message}</td><td>{new Date(n.created_at).toLocaleString('vi-VN')}</td>
          <td>{!n.read_at && <button className="sm g" onClick={() => void run(() => api.put(`/api/notifications/${n.id}`, {}))}>Đã đọc</button>}{' '}
            {auth.role() !== 'viewer' && <button className="sm r" onClick={() => void run(() => api.del(`/api/notifications/${n.id}`))}>Xóa</button>}</td>
        </tr>)}
        {!notifications.length && <tr><td colSpan={5}>Chưa có thông báo</td></tr>}
        </tbody></table></div>
    </div>
  </>;
}

const ROLE_NAMES: Record<User['role'], string> = { admin: 'Quản trị viên', hr: 'Nhân sự', viewer: 'Chỉ xem' };
const ROLE_ACCESS: [string, string, string, string][] = [
  ['Tổng quan, nhân viên, phòng ban', 'Xem/sửa', 'Xem/sửa', 'Chỉ xem'],
  ['Chấm công, nghỉ phép', 'Xem/sửa', 'Xem/sửa', 'Chỉ xem'],
  ['Lương, đánh giá, tuyển dụng, đào tạo', 'Xem/sửa', 'Xem/sửa', 'Chỉ xem'],
  ['Báo cáo, thông báo', 'Xem/sửa', 'Xem/sửa', 'Xem/đọc thông báo'],
  ['Quản lý tài khoản, đặt lại dữ liệu', 'Đầy đủ', 'Không', 'Không'],
];

export function Settings({ user, theme, onSave, onLogout }: { user: string; theme: string; onSave: (u: string, t: string) => void; onLogout: () => void }) {
  const { reload } = useData(); const run = useAction();
  const [u, setU] = useState(user), [t, setT] = useState(theme);
  const [users, setUsers] = useState<User[]>([]);
  const [accountError, setAccountError] = useState('');
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [role, setRole] = useState<User['role']>('hr');
  const loadUsers = async () => {
    try { setUsers(await api.get<User[]>('/api/users')); setAccountError(''); }
    catch (e) { setAccountError(e instanceof Error ? e.message : 'Không tải được tài khoản'); }
  };
  useEffect(() => { void loadUsers(); }, []);
  const manage = async (fn: () => Promise<unknown>) => { if (await run(fn)) await loadUsers(); };
  const reset = () => { if (confirm('Xóa toàn bộ dữ liệu về mặc định?')) void run(() => api.post('/api/reset')).then(() => { void reload(); }); };
  const addUser = () => {
    if (!username.trim() || password.length < 8) return alert('Nhập tên đăng nhập và mật khẩu ít nhất 8 ký tự');
    void manage(async () => {
      await api.post('/api/users', { username: username.trim(), password, role });
      setUsername(''); setPassword('');
    });
  };
  const currentUsername = auth.username();
  return <>
    <h1>Cài đặt &amp; Phân quyền</h1>
    <div className="card">
      <div className="f">
        <label>Tên hiển thị<input value={u} onChange={e => setU(e.target.value)} /></label>
        <label>Giao diện<select value={t} onChange={e => setT(e.target.value)}>
          <option value="">Theo hệ thống</option><option value="light">Sáng</option><option value="dark">Tối</option></select></label>
      </div>
      <div className="bar" style={{ marginTop: 14 }}>
        <button onClick={() => onSave(u, t)}>Lưu</button>
        <button className="r" onClick={reset}>Đặt lại dữ liệu</button>
        <button className="g" onClick={onLogout}>Đăng xuất</button>
      </div>
    </div>
    <div className="card">
      <h3>Vai trò và quyền</h3>
      <p>Quyền được kiểm tra ở máy chủ; tài khoản chỉ xem không thể gọi API ghi dữ liệu.</p>
      <div className="tw"><table>
        <thead><tr><th>Phạm vi</th><th>Quản trị viên</th><th>Nhân sự</th><th>Chỉ xem</th></tr></thead>
        <tbody>{ROLE_ACCESS.map(row => <tr key={row[0]}>{row.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody>
      </table></div>
    </div>
    <div className="card">
      <h3>Tài khoản</h3>
      <div className="bar">
        <input placeholder="Tên đăng nhập" value={username} onChange={e => setUsername(e.target.value)} />
        <input type="password" placeholder="Mật khẩu (ít nhất 8 ký tự)" value={password} onChange={e => setPassword(e.target.value)} />
        <select value={role} onChange={e => setRole(e.target.value as User['role'])}>
          {Object.entries(ROLE_NAMES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button onClick={addUser}>Tạo tài khoản</button>
      </div>
      {accountError && <p role="alert">{accountError}</p>}
      <div className="tw"><table>
        <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Hoạt động</th><th></th></tr></thead>
        <tbody>{users.map(item => {
          const isSelf = item.username === currentUsername;
          return <tr key={item.id}>
            <td>{item.username}{isSelf ? ' (đang đăng nhập)' : ''}</td>
            <td><select value={item.role} disabled={isSelf} onChange={e => void manage(() => api.put(`/api/users/${item.id}`, { role: e.target.value }))}>
              {Object.entries(ROLE_NAMES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select></td>
            <td><input aria-label={`Tài khoản ${item.username} hoạt động`} type="checkbox" checked={Boolean(item.active)} disabled={isSelf}
              onChange={e => void manage(() => api.put(`/api/users/${item.id}`, { active: e.target.checked }))} /></td>
            <td>{!isSelf && <>
              <button className="sm g" onClick={() => {
                const nextPassword = prompt(`Mật khẩu mới cho ${item.username} (ít nhất 8 ký tự):`);
                if (nextPassword) void manage(() => api.put(`/api/users/${item.id}`, { password: nextPassword }));
              }}>Đặt lại mật khẩu</button>{' '}
              <button className="sm r" onClick={() => {
                if (confirm(`Xóa tài khoản ${item.username}?`)) void manage(() => api.del(`/api/users/${item.id}`));
              }}>Xóa</button>
            </>}</td>
          </tr>;
        })}
        {!users.length && <tr><td colSpan={4}>Chưa tải được danh sách tài khoản</td></tr>}
        </tbody></table></div>
    </div>
  </>;
}
