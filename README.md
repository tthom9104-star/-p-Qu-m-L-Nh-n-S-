# Coral HR — React + TypeScript / Express / MySQL

```
GitHub (1 repo)
├── frontend/  → Vercel   (*.vercel.app)
├── backend/   → Render   (*.onrender.com)
└── DB MySQL   → Aiven
```

## Cấu trúc thư mục

```
coral-hr/
├── frontend/                 # Vite + React + TypeScript (cấu trúc chuẩn)
│   ├── public/               # Tài nguyên tĩnh (favicon.svg)
│   ├── src/
│   │   ├── assets/           # Hình ảnh, logo
│   │   ├── App.css           # Style cho App component
│   │   ├── App.tsx           # Component chính: đăng nhập, thanh điều hướng
│   │   ├── index.css         # Style toàn cục (biến màu, giao diện sáng/tối)
│   │   ├── main.tsx          # Entry point gắn React vào HTML
│   │   ├── pages.tsx         # 11 trang: Tổng quan, Nhân viên, Lương...
│   │   ├── data.tsx          # Context lấy dữ liệu từ API (State dùng chung)
│   │   ├── api.ts            # Hàm gọi backend + lưu token
│   │   └── types.ts          # Định nghĩa kiểu dữ liệu TypeScript
│   ├── .gitignore
│   ├── eslint.config.js      # Cấu hình ESLint
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/                  # Node + Express + MySQL
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── README.md
```

## 1. Chạy thử trên máy
```bash
# Backend (cần một MySQL: dùng luôn Aiven hoặc MySQL cài sẵn)
cd backend && cp .env.example .env     # sửa DATABASE_URL
npm install && npm run dev             # http://localhost:4000

# Frontend
cd frontend && cp .env.example .env
npm install && npm run dev             # http://localhost:5173
npm run lint                           # kiểm tra code bằng ESLint
```
Đăng nhập bằng `ADMIN_USER` / `ADMIN_PASS` bạn đặt trong `backend/.env` (nếu để trống ở máy local, mật khẩu tạm là `123456` và server sẽ cảnh báo).
Lần chạy đầu, backend tự tạo bảng và nạp dữ liệu mẫu.

> Tạo `JWT_SECRET` ngẫu nhiên: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 2. Đẩy code lên GitHub
```bash
git init && git add . && git commit -m "Coral HR"
git branch -M main
git remote add origin https://github.com/<ten-ban>/coral-hr.git
git push -u origin main
```

## 3. Database — Aiven (MySQL)
1. Vào https://aiven.io → tạo service **MySQL** (chọn gói Free nếu có).
2. Khi service chạy xong, copy **Service URI** (dạng `mysql://avnadmin:...@...aivencloud.com:PORT/defaultdb?ssl-mode=REQUIRED`).
3. Không cần import SQL: backend tự tạo bảng khi khởi động.

## 4. Backend — Render
1. Render → **New → Web Service** → chọn repo GitHub.
2. **Root Directory**: `backend` · **Build Command**: `npm install` · **Start Command**: `npm start`.
3. Environment Variables:
   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | Service URI của Aiven |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | chuỗi ngẫu nhiên ≥ 32 ký tự (xem lệnh tạo ở trên) |
   | `ADMIN_USER` / `ADMIN_PASS` | tài khoản đăng nhập, mật khẩu ≥ 8 ký tự, không dùng `123456` |
   | `FRONTEND_URL` | URL Vercel (điền sau bước 5) |
   | `DB_CA` | (khuyến nghị) CA certificate của Aiven, xuống dòng thay bằng `\n` |
   | `ALLOW_RESET` | để trống/`false`. Chỉ đặt `true` khi muốn dùng nút "Đặt lại dữ liệu" |

   Server từ chối khởi động nếu `JWT_SECRET`/`ADMIN_PASS` yếu khi chạy production hoặc nối DB từ xa.
4. Deploy xong sẽ có URL dạng `https://xxx.onrender.com`. Mở `/health` để kiểm tra (phải trả `{"ok":true}`).

## 5. Frontend — Vercel
1. Vercel → **Add New → Project** → chọn repo.
2. **Root Directory**: `frontend` (Framework tự nhận Vite).
3. Environment Variable: `VITE_API_URL` = URL Render (không có `/` cuối).
4. Deploy → có URL `https://xxx.vercel.app`.
5. Quay lại Render, đặt `FRONTEND_URL` = URL Vercel đó rồi **Save** (Render tự deploy lại).

## Thay đổi bảo mật & sửa lỗi (bản này)
- Bỏ tài khoản điền sẵn ở form đăng nhập; bắt buộc secret mạnh khi production; giới hạn 5 lần đăng nhập sai / 15 phút / IP.
- `/api/reset` mặc định tắt (bật bằng `ALLOW_RESET=true`).
- Hỗ trợ kiểm tra chứng chỉ SSL của DB qua `DB_CA`.
- Chấm công: ngày giờ do **server** quyết định (múi giờ Việt Nam); không check-out hai lần, giờ ra không trước giờ vào.
- Kiểm tra dữ liệu ở cả POST và PUT (email, lương ≥ 0, trạng thái, ngày, phòng ban/nhân viên/vị trí phải tồn tại); `PUT` id không có trả 404.
- Xóa nhân viên dùng transaction; đổi tên phòng ban cập nhật luôn nhân viên thuộc phòng đó.
- Sửa lỗi form nhân viên giữ dữ liệu cũ khi chuyển trang; CSV được escape đúng.
- Bảng lương dùng biểu thuế TNCN 5 bậc, giảm trừ bản thân 15,5tr (chưa có người phụ thuộc, chưa có trần đóng bảo hiểm, chưa nối với chấm công) — đối chiếu với kế toán trước khi dùng thật.

## Lưu ý
- Gói Free của Render "ngủ" sau một thời gian không dùng, lần mở đầu có thể chờ ~30–60 giây.
- Đổi `VITE_API_URL` trên Vercel thì phải **Redeploy** vì biến được gắn lúc build.
- Nếu đăng nhập báo lỗi CORS: kiểm tra `FRONTEND_URL` đúng, không thừa dấu `/`.
