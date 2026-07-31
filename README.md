# Quản Lý Sửa Chữa Điện Thoại

Ứng dụng React dùng Supabase làm nguồn dữ liệu duy nhất cho một chủ cửa hàng nhập điện thoại cũ, kiểm tra tình trạng, thay linh kiện hư hỏng, quản lý tồn kho linh kiện, tính tổng vốn và tự quyết định giá bán ra.

## Công nghệ

- React 19, Vite, TypeScript
- TailwindCSS với component primitives theo phong cách shadcn/ui
- Supabase client và SQL migration cho lưu trữ dữ liệu
- TanStack Query, React Hook Form, Zod, Recharts
- Hỗ trợ PWA qua `vite-plugin-pwa`

## Chạy cục bộ

```bash
npm install
npm run dev
```

Mở URL Vite hiển thị trong terminal. Ứng dụng sẽ tạo dữ liệu mẫu cho điện thoại, linh kiện, sửa chữa, khách hàng, chi phí và bán hàng trong lần chạy đầu tiên.

## Supabase

1. Tạo một Supabase project.
2. Chạy `supabase/migrations/001_initial_schema.sql`.
3. Tạo user đăng nhập trong Supabase Dashboard: Authentication → Users → Add user.
4. Sao chép `.env.example` thành `.env`.
5. Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.
6. Nếu trước đây đã chạy `supabase/migrations/002_allow_anon_app_access.sql`, chạy thêm `supabase/migrations/004_require_supabase_auth.sql` để gỡ quyền anon và chỉ cho user đã đăng nhập đọc/ghi dữ liệu.

Giao diện đọc/ghi trực tiếp với Supabase khi `.env` đã cấu hình và người dùng đã đăng nhập bằng Supabase Auth. Ứng dụng không còn lưu dữ liệu vào IndexedDB.

Đơn vị tiền tệ mặc định là `VND`. Nếu dự án Supabase đã có dữ liệu cài đặt cũ, chạy thêm `supabase/migrations/003_set_currency_vnd.sql`.

## Đăng nhập

Ứng dụng yêu cầu đăng nhập trước khi đọc dữ liệu Supabase. Tài khoản đăng nhập là email/mật khẩu được tạo trong Supabase Authentication, không lưu mật khẩu trong source hay `.env` frontend.

Sau khi đăng nhập, thiết bị đó được giữ phiên tối đa 2 ngày. Bấm nút đăng xuất trên thanh công cụ để xoá phiên sớm hơn.

## Luồng nghiệp vụ chính

1. Nhập điện thoại cũ vào hệ thống.
2. Ghi nhận thông tin nhập hàng gồm hãng, model, tên người mua, giá mua, phí vận chuyển, tình trạng, ghi chú và ảnh sản phẩm upload.
3. Quản lý kho linh kiện ở luồng riêng: tên linh kiện, danh mục, model tương thích, giá nhập, số lượng tồn, tồn tối thiểu và nhà cung cấp.
4. Mở từng điện thoại để chọn các linh kiện đã thay thế từ kho.
5. Khi lưu thay linh kiện, hệ thống tự trừ tồn kho, lưu lịch sử sửa chữa và cộng chi phí linh kiện/công sửa vào tổng vốn của máy.
6. Hệ thống hiển thị giá nhập máy, phí vận chuyển, tổng chi phí thay linh kiện và tổng vốn.
7. Giá bán ra chỉ cập nhật ở bước bán hàng; chức năng đề xuất giá bán sẽ làm sau.

## Tính năng đã có

- Tổng quan chỉ số và biểu đồ theo tháng
- Màn hình đăng nhập và giữ phiên 2 ngày theo từng thiết bị
- Nhập điện thoại cũ với hãng, model, tên người mua, giá mua, phí vận chuyển, tình trạng, ghi chú và ảnh sản phẩm
- CRUD tồn kho linh kiện với cảnh báo sắp hết
- Chọn linh kiện thay thế cho từng điện thoại và tự trừ tồn kho
- Tự tính giá nhập máy, phí vận chuyển, chi phí thay linh kiện, công sửa và tổng vốn
- Cập nhật giá bán ra ở màn bán hàng, tự chuyển máy sang đã bán và lưu khách hàng/bảo hành
- Lịch sử mua của khách hàng
- Bảng báo cáo lợi nhuận và biên lợi nhuận
- Sao lưu và khôi phục JSON qua dữ liệu Supabase đang hiển thị
- Chế độ tối và hộp thoại thân thiện trên mobile
- Phím tắt: `Ctrl+N` thêm máy, `Ctrl+F` tìm kiếm
- PWA manifest và service worker khi build

## Triển khai

Build để triển khai lên Vercel hoặc Netlify:

```bash
npm run build
```

Publish thư mục `dist` được tạo ra, hoặc import repository trực tiếp vào Vercel/Netlify.
