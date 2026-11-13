import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';

const {
  PORT = 4000, FRONTEND_URL = '*', NODE_ENV = 'development', ALLOW_RESET = 'false', DB_CA = '',
} = process.env;
const unquote = v => v.trim().replace(/^["']|["']$/g, '').trim();
const DATABASE_URL = unquote(unquote(process.env.DATABASE_URL || '').replace(/^DATABASE_URL\s*=\s*/, ''));
if (!DATABASE_URL) { console.error('Thiếu DATABASE_URL trong backend/.env'); process.exit(1); }

// ---- Kết nối MySQL (Aiven bắt buộc SSL) ----
let u;
try { u = new URL(DATABASE_URL); } catch {
  console.error('DATABASE_URL không đúng dạng. Mẫu: mysql://root:MAT_KHAU@127.0.0.1:3306/coral_hr');
  process.exit(1);
}
const local = ['localhost', '127.0.0.1'].includes(u.hostname);
const isProdEnv = NODE_ENV === 'production';
// DB không phải máy local (Aiven...) hoặc NODE_ENV=production => bắt buộc secret mạnh.
const needStrong = isProdEnv || !local;

// ---- Tài khoản + secret ----
const WEAK_SECRETS = ['dev-secret', 'doi-thanh-chuoi-bi-mat-dai'];
const WEAK_PASSES = ['123456', '12345678', 'password', 'admin', 'admin123'];
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
let JWT_SECRET = process.env.JWT_SECRET || '';
let ADMIN_PASS = process.env.ADMIN_PASS || '';
if (needStrong) {
  const problems = [];
  if (JWT_SECRET.length < 32 || WEAK_SECRETS.includes(JWT_SECRET)) problems.push('JWT_SECRET phải dài ≥ 32 ký tự và không dùng giá trị mẫu');
  if (ADMIN_PASS.length < 8 || WEAK_PASSES.includes(ADMIN_PASS)) problems.push('ADMIN_PASS phải dài ≥ 8 ký tự và không dùng mật khẩu mặc định');
  if (problems.length) {
    console.error('Cấu hình chưa an toàn:\n - ' + problems.join('\n - '));
    console.error('Tạo secret ngẫu nhiên:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
} else {
  if (!JWT_SECRET) { JWT_SECRET = crypto.randomBytes(32).toString('hex'); console.warn('[dev] Không có JWT_SECRET: dùng secret ngẫu nhiên (đăng nhập sẽ mất khi restart).'); }
  if (!ADMIN_PASS) { ADMIN_PASS = '123456'; console.warn('[dev] Không có ADMIN_PASS: dùng mật khẩu mặc định 123456 (chỉ cho máy local).'); }
}

const ssl = local ? undefined
  : DB_CA ? { ca: DB_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true }
    : { rejectUnauthorized: false };
if (!local && !DB_CA) console.warn('[bảo mật] Chưa có DB_CA: kết nối SSL tới DB không kiểm tra chứng chỉ. Hãy dán CA certificate của Aiven vào biến DB_CA.');

const pool = mysql.createPool({
  host: u.hostname, port: Number(u.port || 3306),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1) || 'defaultdb',
  ssl, dateStrings: true, connectionLimit: 5, charset: 'utf8mb4',
});

async function tx(fn) {
  const c = await pool.getConnection();
  try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
  catch (e) { await c.rollback(); throw e; }
  finally { c.release(); }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS departments(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS employees(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, email VARCHAR(150) NOT NULL,
    phone VARCHAR(30), dept VARCHAR(100), pos VARCHAR(100), salary BIGINT DEFAULT 0, gender VARCHAR(10),
    status VARCHAR(20) DEFAULT 'Đang làm', join_date DATE)`,
  `CREATE TABLE IF NOT EXISTS leaves(id INT AUTO_INCREMENT PRIMARY KEY, eid INT NOT NULL, from_date DATE, to_date DATE,
    reason VARCHAR(255), status VARCHAR(20) DEFAULT 'Chờ duyệt')`,
  `CREATE TABLE IF NOT EXISTS attendance(id INT AUTO_INCREMENT PRIMARY KEY, eid INT NOT NULL, date DATE NOT NULL,
    time_in VARCHAR(5), time_out VARCHAR(5), UNIQUE KEY uq_att(eid, date))`,
  `CREATE TABLE IF NOT EXISTS jobs(id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(150) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS candidates(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, job_id INT, stage INT DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS reviews(eid INT PRIMARY KEY, score INT NOT NULL)`,
];
const TABLES = ['reviews', 'candidates', 'jobs', 'attendance', 'leaves', 'employees', 'departments'];

async function seed() {
  const depts = ['Kỹ thuật', 'Nhân sự', 'Kinh doanh', 'Marketing', 'Kế toán'];
  const emps = [
    ['Nguyễn Văn An', 'Kỹ thuật', 'Lập trình viên', 22000000, 'Nam'], ['Trần Thị Bình', 'Nhân sự', 'Chuyên viên HR', 15000000, 'Nữ'],
    ['Lê Hoàng Cường', 'Kinh doanh', 'Trưởng nhóm', 20000000, 'Nam'], ['Phạm Minh Dung', 'Marketing', 'Content', 14000000, 'Nữ'],
    ['Võ Quốc Em', 'Kế toán', 'Kế toán viên', 13000000, 'Nam'], ['Đặng Thu Hà', 'Kỹ thuật', 'Tester', 16000000, 'Nữ'],
    ['Bùi Gia Huy', 'Kinh doanh', 'Nhân viên KD', 12000000, 'Nam'], ['Hoàng Lan Chi', 'Kỹ thuật', 'Quản lý', 30000000, 'Nữ'],
  ];
  await pool.query('INSERT INTO departments(name) VALUES ?', [depts.map(d => [d])]);
  await pool.query('INSERT INTO employees(name,email,phone,dept,pos,salary,gender,status,join_date) VALUES ?', [
    emps.map((e, i) => [e[0], `nv${i + 1}@coral.vn`, `090000${1000 + i}`, e[1], e[2], e[3], e[4], i === 6 ? 'Nghỉ phép' : 'Đang làm', `2023-0${(i % 9) + 1}-15`]),
  ]);
  await pool.query('INSERT INTO leaves(eid,from_date,to_date,reason,status) VALUES ?', [[
    [2, '2026-11-10', '2026-11-12', 'Việc gia đình', 'Chờ duyệt'], [4, '2026-11-03', '2026-11-04', 'Ốm', 'Đã duyệt'],
  ]]);
  await pool.query('INSERT INTO jobs(title) VALUES ?', [[['Lập trình viên React'], ['Nhân viên Marketing'], ['Kế toán tổng hợp']]]);
  await pool.query('INSERT INTO candidates(name,job_id,stage) VALUES ?', [[['Mai Phương', 1, 0], ['Tuấn Kiệt', 1, 1], ['Ngọc Anh', 2, 2], ['Quang Vinh', 3, 3]]]);
  await pool.query('INSERT INTO reviews(eid,score) VALUES ?', [[[1, 4], [2, 3], [3, 5]]]);
}

async function init() {
  for (const sql of SCHEMA) await pool.query(sql);
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM employees');
  if (!n) await seed();
}

// ---- Tiện ích kiểm tra dữ liệu ----
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const EMP_STATUS = ['Đang làm', 'Nghỉ phép', 'Đã nghỉ'];
const GENDER = ['Nam', 'Nữ'];
const LEAVE_STATUS = ['Chờ duyệt', 'Đã duyệt', 'Từ chối'];
const isStr = (v, max, min = 0) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const isDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  try { return new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; } catch { return false; }
};
const exists = async (sql, params) => !!(await pool.query(sql, params))[0][0];

// Giờ do SERVER quyết định (múi giờ Việt Nam), không tin đồng hồ trình duyệt.
const vnFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const vnNow = () => {
  const p = Object.fromEntries(vnFmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

// ---- Chống dò mật khẩu: tối đa 5 lần sai / 15 phút / IP ----
const WINDOW_MS = 15 * 60 * 1000, MAX_FAILS = 5;
const fails = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of fails) if (now - v.t >= WINDOW_MS) fails.delete(k); }, 60 * 1000).unref();
const blocked = ip => { const f = fails.get(ip); return !!f && f.n >= MAX_FAILS && Date.now() - f.t < WINDOW_MS; };
const noteFail = ip => {
  const f = fails.get(ip);
  if (!f || Date.now() - f.t >= WINDOW_MS) fails.set(ip, { n: 1, t: Date.now() }); else f.n++;
};
const safeEq = (a, b) => {
  const hash = x => crypto.createHash('sha256').update(String(x ?? '')).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
};

// ---- App ----
const app = express();
app.set('trust proxy', 1); // đứng sau proxy của Render để lấy đúng IP
const allowed = FRONTEND_URL.split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
if (isProdEnv && allowed.includes('*')) console.warn('[bảo mật] FRONTEND_URL đang là * — hãy đặt đúng URL Vercel.');
const isLocalOrigin = o => { try { return ['localhost', '127.0.0.1'].includes(new URL(o).hostname); } catch { return false; } };
app.use(cors({ origin: (o, cb) => cb(null, !o || allowed.includes('*') || allowed.includes(o) || (!isProdEnv && isLocalOrigin(o))) }));
app.use((_q, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '100kb' }));
const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

app.get('/health', (_q, res) => res.json({ ok: true }));
app.post('/api/auth/login', (req, res) => {
  if (blocked(req.ip)) return bad(res, 'Đăng nhập sai quá nhiều lần, thử lại sau 15 phút', 429);
  const { username, password } = req.body || {};
  const okUser = safeEq(username, ADMIN_USER), okPass = safeEq(password, ADMIN_PASS);
  if (!(okUser && okPass)) { noteFail(req.ip); return bad(res, 'Sai tài khoản hoặc mật khẩu', 401); }
  fails.delete(req.ip);
  res.json({ token: jwt.sign({ user: ADMIN_USER }, JWT_SECRET, { expiresIn: '12h' }) });
});

const api = express.Router();
api.use((req, res, next) => {
  try { jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' }); }
});

// ---- CRUD chung + kiểm tra riêng từng bảng ----
const CRUD = {
  employees: ['name', 'email', 'phone', 'dept', 'pos', 'salary', 'gender', 'status', 'join_date'],
  departments: ['name'],
  leaves: ['eid', 'from_date', 'to_date', 'reason', 'status'],
  candidates: ['name', 'job_id', 'stage'],
};
const pick = (o, cols) => (o && typeof o === 'object' ? Object.fromEntries(cols.filter(c => o[c] !== undefined).map(c => [c, o[c]])) : {});

// Mỗi hàm trả về chuỗi lỗi (nếu sai) hoặc undefined; đồng thời chuẩn hóa d tại chỗ.
const CLEAN = {
  employees: async (d, creating) => {
    if (creating || d.name !== undefined) { if (!isStr(d.name, 150, 1)) return 'Họ tên không hợp lệ'; d.name = d.name.trim(); }
    if (creating || d.email !== undefined) { if (!isStr(d.email, 150, 1) || !EMAIL_RE.test(d.email.trim())) return 'Email không hợp lệ'; d.email = d.email.trim(); }
    for (const [k, max] of [['phone', 30], ['pos', 100]]) {
      if (d[k] === undefined) continue;
      if (d[k] === null) d[k] = '';
      if (!isStr(d[k], max)) return `Trường ${k} sai kiểu hoặc quá dài`;
      d[k] = d[k].trim();
    }
    if (d.dept !== undefined) {
      if (d.dept === null) d.dept = '';
      if (!isStr(d.dept, 100)) return 'Phòng ban không hợp lệ';
      d.dept = d.dept.trim();
      if (d.dept && !(await exists('SELECT 1 FROM departments WHERE name=?', [d.dept]))) return 'Phòng ban không tồn tại';
    }
    if (d.salary !== undefined) {
      const n = Number(d.salary);
      if (!Number.isInteger(n) || n < 0 || n > 1e11) return 'Lương phải là số nguyên không âm';
      d.salary = n;
    }
    if (d.gender !== undefined && !GENDER.includes(d.gender)) return 'Giới tính không hợp lệ';
    if (d.status !== undefined && !EMP_STATUS.includes(d.status)) return 'Trạng thái không hợp lệ';
    if (d.join_date !== undefined) {
      if (d.join_date === '' || d.join_date === null) d.join_date = null;
      else if (!isDate(d.join_date)) return 'Ngày vào làm không hợp lệ';
    }
  },
  departments: async d => {
    if (!isStr(d.name, 100, 1)) return 'Tên phòng ban không hợp lệ';
    d.name = d.name.trim();
  },
  leaves: async (d, creating, cur) => {
    if (creating) d.status = 'Chờ duyệt';
    if (creating || d.eid !== undefined) {
      const eid = Number(d.eid);
      if (!Number.isInteger(eid) || !(await exists('SELECT 1 FROM employees WHERE id=?', [eid]))) return 'Nhân viên không tồn tại';
      d.eid = eid;
    }
    const m = { ...cur, ...d };
    if (!isDate(m.from_date) || !isDate(m.to_date)) return 'Ngày nghỉ không hợp lệ';
    if (m.to_date < m.from_date) return 'Ngày kết thúc phải sau ngày bắt đầu';
    if (d.reason !== undefined) {
      if (d.reason === null) d.reason = '';
      if (!isStr(d.reason, 255)) return 'Lý do quá dài';
      d.reason = d.reason.trim() || '-';
    }
    if (d.status !== undefined) {
      if (!LEAVE_STATUS.includes(d.status)) return 'Trạng thái không hợp lệ';
      if (cur && cur.status !== 'Chờ duyệt' && d.status !== cur.status) return 'Đơn này đã được xử lý, không đổi được nữa';
    }
  },
  candidates: async (d, creating) => {
    if (creating || d.name !== undefined) { if (!isStr(d.name, 150, 1)) return 'Tên ứng viên không hợp lệ'; d.name = d.name.trim(); }
    if (creating || d.job_id !== undefined) {
      const j = Number(d.job_id);
      if (!Number.isInteger(j) || !(await exists('SELECT 1 FROM jobs WHERE id=?', [j]))) return 'Vị trí tuyển dụng không tồn tại';
      d.job_id = j;
    }
    if (d.stage !== undefined) {
      const s = Number(d.stage);
      if (!Number.isInteger(s) || s < 0 || s > 3) return 'Giai đoạn không hợp lệ';
      d.stage = s;
    }
  },
};
const parseId = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

for (const [t, cols] of Object.entries(CRUD)) {
  api.get(`/${t}`, h(async (_q, res) => res.json((await pool.query(`SELECT * FROM ${t} ORDER BY id`))[0])));

  api.post(`/${t}`, h(async (req, res) => {
    const d = pick(req.body, cols);
    if (!Object.keys(d).length) return bad(res, 'Dữ liệu trống');
    const err = await CLEAN[t](d, true);
    if (err) return bad(res, err);
    try { const [r] = await pool.query(`INSERT INTO ${t} SET ?`, [d]); res.status(201).json({ id: r.insertId, ...d }); }
    catch (e) { if (e.code === 'ER_DUP_ENTRY') return bad(res, 'Dữ liệu đã tồn tại'); throw e; }
  }));

  api.put(`/${t}/:id`, h(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Mã không hợp lệ');
    const [[cur]] = await pool.query(`SELECT * FROM ${t} WHERE id=?`, [id]);
    if (!cur) return bad(res, 'Không tìm thấy bản ghi', 404);
    const d = pick(req.body, cols);
    if (!Object.keys(d).length) return bad(res, 'Dữ liệu trống');
    const err = await CLEAN[t](d, false, cur);
    if (err) return bad(res, err);
    try {
      if (t === 'departments' && d.name !== cur.name) {
        // Đổi tên phòng ban phải cập nhật luôn nhân viên đang thuộc phòng đó.
        await tx(async c => {
          await c.query('UPDATE departments SET ? WHERE id=?', [d, id]);
          await c.query('UPDATE employees SET dept=? WHERE dept=?', [d.name, cur.name]);
        });
      } else {
        await pool.query(`UPDATE ${t} SET ? WHERE id=?`, [d, id]);
      }
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') return bad(res, 'Dữ liệu đã tồn tại'); throw e; }
    res.json({ ...cur, ...d });
  }));

  api.delete(`/${t}/:id`, h(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Mã không hợp lệ');
    if (t === 'departments') {
      const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM employees WHERE dept=(SELECT name FROM departments WHERE id=?)', [id]);
      if (n) return bad(res, 'Phòng ban còn nhân viên, không thể xóa');
    }
    if (t === 'employees') {
      await tx(async c => {
        for (const x of ['attendance', 'leaves', 'reviews']) await c.query(`DELETE FROM ${x} WHERE eid=?`, [id]);
        await c.query('DELETE FROM employees WHERE id=?', [id]);
      });
    } else {
      await pool.query(`DELETE FROM ${t} WHERE id=?`, [id]);
    }
    res.json({ ok: true });
  }));
}

api.get('/jobs', h(async (_q, res) => res.json((await pool.query('SELECT * FROM jobs ORDER BY id'))[0])));
api.get('/reviews', h(async (_q, res) => res.json((await pool.query('SELECT * FROM reviews'))[0])));
api.put('/reviews/:eid', h(async (req, res) => {
  const eid = parseId(req.params.eid), s = Number(req.body?.score);
  if (!eid || !(await exists('SELECT 1 FROM employees WHERE id=?', [eid]))) return bad(res, 'Nhân viên không tồn tại', 404);
  if (!Number.isInteger(s) || s < 1 || s > 5) return bad(res, 'Điểm phải là số nguyên từ 1 đến 5');
  await pool.query('INSERT INTO reviews(eid,score) VALUES(?,?) ON DUPLICATE KEY UPDATE score=VALUES(score)', [eid, s]);
  res.json({ eid, score: s });
}));

api.get('/attendance', h(async (_q, res) => res.json((await pool.query('SELECT * FROM attendance ORDER BY date DESC, id DESC LIMIT 200'))[0])));
api.post('/attendance/check', h(async (req, res) => {
  const { eid, type } = req.body || {};
  const id = parseId(eid);
  if (!id || !['in', 'out'].includes(type)) return bad(res, 'Thiếu dữ liệu chấm công');
  const [[emp]] = await pool.query('SELECT status FROM employees WHERE id=?', [id]);
  if (!emp) return bad(res, 'Nhân viên không tồn tại', 404);
  if (emp.status === 'Đã nghỉ') return bad(res, 'Nhân viên đã nghỉ việc, không chấm công được');
  const { date, time } = vnNow(); // ngày giờ lấy từ server
  const [[row]] = await pool.query('SELECT * FROM attendance WHERE eid=? AND date=?', [id, date]);
  if (type === 'in') {
    if (row) return bad(res, `Đã check-in hôm nay lúc ${row.time_in}`);
    await pool.query('INSERT INTO attendance(eid,date,time_in) VALUES(?,?,?)', [id, date, time]);
  } else {
    if (!row) return bad(res, 'Chưa check-in');
    if (row.time_out) return bad(res, `Đã check-out hôm nay lúc ${row.time_out}`);
    if (time < row.time_in) return bad(res, 'Giờ ra không thể trước giờ vào');
    await pool.query('UPDATE attendance SET time_out=? WHERE id=?', [time, row.id]);
  }
  res.json({ ok: true, date, time });
}));

// Chỉ bật khi đặt ALLOW_RESET=true (mặc định tắt để không ai xóa nhầm dữ liệu thật).
api.post('/reset', h(async (_q, res) => {
  if (ALLOW_RESET !== 'true') return bad(res, 'Chức năng đặt lại dữ liệu đang tắt (đặt ALLOW_RESET=true để bật)', 403);
  for (const t of TABLES) await pool.query(`TRUNCATE TABLE ${t}`);
  await seed(); res.json({ ok: true });
}));

app.use('/api', api);
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return bad(res, 'JSON không hợp lệ');
  if (err.type === 'entity.too.large') return bad(res, 'Dữ liệu gửi lên quá lớn', 413);
  console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' });
});

init().then(() => app.listen(PORT, () => console.log('API chạy ở cổng ' + PORT)))
  .catch(e => { console.error('Không khởi tạo được database:', e.message);
    if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('→ Sai tên đăng nhập hoặc mật khẩu trong DATABASE_URL.');
    if (e.code === 'ER_BAD_DB_ERROR') console.error('→ Chưa tạo database. Chạy: CREATE DATABASE coral_hr;');
    if (e.code === 'ECONNREFUSED') console.error('→ MySQL chưa chạy (hoặc sai cổng).');
    process.exit(1); });
