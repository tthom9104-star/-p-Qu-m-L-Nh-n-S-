# Coral HR — React + TypeScript / Express / MySQL

```
Một ứng dụng, một dịch vụ deploy
├── frontend/  → React + Vite
├── backend/   → Express API + phục vụ frontend đã build
└── DB MySQL   → Aiven hoặc MySQL local
```

## Cấu trúc thư mục

```
coral-hr/
├── package.json              # Dependency và lệnh chạy/build chung
├── package-lock.json         # Dependency lock chung
├── .env.example              # Cấu hình database/tài khoản
├── frontend/                 # Vite + React + TypeScript (cấu trúc chuẩn)
│   ├── public/               # Tài nguyên tĩnh (favicon.svg)
│   ├── src/
│   │   ├── assets/           # Hình ảnh, logo
│   │   ├── App.css           # Style cho App component
│   │   ├── App.tsx           # Component chính: đăng nhập, thanh điều hướng
│   │   ├── index.css         # Style toàn cục (biến màu, giao diện sáng/tối)
│   │   ├── main.tsx          # Entry point gắn React vào HTML
│   │   ├── pages.tsx         # Các trang quản lý nhân sự
│   │   ├── data.tsx          # Context lấy dữ liệu từ API (State dùng chung)
│   │   ├── api.ts            # Hàm gọi backend + lưu token
│   │   └── types.ts          # Định nghĩa kiểu dữ liệu TypeScript
│   ├── eslint.config.js      # Cấu hình ESLint
│   ├── index.html
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/                  # Node + Express + MySQL
│   ├── server.js
├── .gitignore
└── README.md
```

## 1. Chạy trên máy
```bash
# Cài tất cả dependency từ thư mục gốc
npm install

# Tạo .env ở thư mục gốc, rồi sửa DATABASE_URL và thông tin đăng nhập
# Windows PowerShell:
Copy-Item .env.example .env

# Chạy API và frontend cùng lúc tại http://localhost:5173
npm run dev

# Trên Windows, sau khi đã cấu hình .env, có thể nhấp đúp start.bat

# Kiểm tra/lint và build frontend
npm run lint
npm run build
```
Vite tự chuyển tiếp `/api` tới backend. Đăng nhập bằng `ADMIN_USER` / `ADMIN_PASS` trong `.env` (nếu để trống ở máy local, mật khẩu tạm là `123456` và server sẽ cảnh báo). Lần chạy đầu, backend tự tạo bảng và nạp dữ liệu mẫu.

Trên Windows, `start.bat` tự cài dependencies nếu cần và khởi động cả API lẫn frontend. Nếu chưa có `.env`, file này tạo từ `.env.example` rồi dừng để bạn cấu hình `DATABASE_URL`. Mở `http://localhost:5173` sau khi terminal báo Vite đã sẵn sàng; giữ cửa sổ terminal mở trong lúc sử dụng.

> Tạo `JWT_SECRET` ngẫu nhiên: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Menu gồm Tổng quan, Quản lý nhân viên, Thêm nhân viên, Phòng ban, Chấm công, Nghỉ phép, Tiền lương, Đánh giá nhân viên, Tuyển dụng, Đào tạo, Báo cáo – Thống kê, Thông báo và Cài đặt & Phân quyền. Tài khoản quản trị lấy từ `ADMIN_USER`/`ADMIN_PASS` được tạo khi khởi tạo database lần đầu.

Trong **Cài đặt & Phân quyền**, quản trị viên có thể tạo/khóa/xóa tài khoản, đổi mật khẩu và gán vai trò:
- **Quản trị viên**: toàn quyền, bao gồm quản lý tài khoản và đặt lại dữ liệu.
- **Nhân sự**: quản lý hồ sơ và nghiệp vụ HR, không quản lý tài khoản hay đặt lại dữ liệu.
- **Chỉ xem**: chỉ đọc dữ liệu; quyền được kiểm tra ở backend, không chỉ ẩn nút trên giao diện.

Đào tạo lưu khóa học theo nhân viên, khoảng ngày và trạng thái. Thông báo được tạo tự động khi có đơn nghỉ phép hoặc khóa đào tạo mới.

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

## 4. Deploy cả ứng dụng — Render
1. Render → **New → Web Service** → chọn repo GitHub.
2. Để **Root Directory** trống (thư mục gốc repo).
3. **Build Command**: `npm install && npm run build` · **Start Command**: `npm start`.
4. Environment Variables:
   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | Service URI của Aiven |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | chuỗi ngẫu nhiên ≥ 32 ký tự (xem lệnh tạo ở trên) |
   | `ADMIN_USER` / `ADMIN_PASS` | tài khoản đăng nhập, mật khẩu ≥ 8 ký tự, không dùng `123456` |
   | `DB_CA` | (khuyến nghị) CA certificate của Aiven, xuống dòng thay bằng `\n` |
   | `ALLOW_RESET` | để trống/`false`. Chỉ đặt `true` khi muốn dùng nút "Đặt lại dữ liệu" |

   Server từ chối khởi động nếu `JWT_SECRET`/`ADMIN_PASS` yếu khi chạy production hoặc nối DB từ xa.
Deploy xong sẽ có một URL duy nhất cho cả giao diện và API. Mở `/health` để kiểm tra (phải trả `{"ok":true}`).

## Thay đổi bảo mật & sửa lỗi (bản này)
- Bỏ tài khoản điền sẵn ở form đăng nhập; bắt buộc secret mạnh khi production; giới hạn 5 lần đăng nhập sai / 15 phút / IP.
- `/api/reset` mặc định tắt (bật bằng `ALLOW_RESET=true`).
- Phân quyền `admin` / `hr` / `viewer` được xác thực ở API; mật khẩu tài khoản lưu bằng `scrypt`.
- Hỗ trợ kiểm tra chứng chỉ SSL của DB qua `DB_CA`.
- Chấm công: ngày giờ do **server** quyết định (múi giờ Việt Nam); không check-out hai lần, giờ ra không trước giờ vào.
- Kiểm tra dữ liệu ở cả POST và PUT (email, lương ≥ 0, trạng thái, ngày, phòng ban/nhân viên/vị trí phải tồn tại); `PUT` id không có trả 404.
- Xóa nhân viên dùng transaction; đổi tên phòng ban cập nhật luôn nhân viên thuộc phòng đó.
- Sửa lỗi form nhân viên giữ dữ liệu cũ khi chuyển trang; CSV được escape đúng.
- Bảng lương dùng biểu thuế TNCN 5 bậc, giảm trừ bản thân 15,5tr (chưa có người phụ thuộc, chưa có trần đóng bảo hiểm, chưa nối với chấm công) — đối chiếu với kế toán trước khi dùng thật.

## Lưu ý
- Gói Free của Render "ngủ" sau một thời gian không dùng, lần mở đầu có thể chờ ~30–60 giây.
- Mặc định frontend gọi API cùng origin; không cần cấu hình `VITE_API_URL` hay `FRONTEND_URL` khi deploy chung.
- `npm start` phục vụ giao diện đã build trong `frontend/dist`; luôn chạy `npm run build` trước khi khởi động production.
