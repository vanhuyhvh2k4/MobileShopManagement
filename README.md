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
7. Với bản có địa chỉ khách hàng, trạng thái vận chuyển, ngày giờ bán và tiền cọc, chạy thêm `supabase/migrations/005_add_customer_address.sql`, `supabase/migrations/006_add_sale_delivery_status.sql` và `supabase/migrations/007_add_sale_datetime_deposit.sql`.
8. Với bản quản lý nhập kho linh kiện nhiều lần/nhiều giá, chạy thêm `supabase/migrations/008_add_part_imports.sql`.
9. Với bản luồng nhập máy có tiền cọc và trạng thái chờ kiểm tra, chạy thêm `supabase/migrations/009_add_phone_purchase_deposit_and_waiting_inspection.sql`.
10. Với bản log hệ thống và thùng rác, chạy thêm `supabase/migrations/010_add_soft_delete_and_app_logs.sql`.
11. Với bản trạng thái từng phiếu nhập linh kiện, chạy thêm `supabase/migrations/011_add_part_import_status.sql`.
12. Với bản giá bán dự kiến theo từng máy, chạy thêm `supabase/migrations/012_add_phone_asking_price.sql`.

Giao diện đọc/ghi trực tiếp với Supabase khi `.env` đã cấu hình và người dùng đã đăng nhập bằng Supabase Auth. Ứng dụng không còn lưu dữ liệu vào IndexedDB.

Đơn vị tiền tệ mặc định là `VND`. Nếu dự án Supabase đã có dữ liệu cài đặt cũ, chạy thêm `supabase/migrations/003_set_currency_vnd.sql`.

## Đăng nhập

Ứng dụng yêu cầu đăng nhập trước khi đọc dữ liệu Supabase. Tài khoản đăng nhập là email/mật khẩu được tạo trong Supabase Authentication, không lưu mật khẩu trong source hay `.env` frontend.

Sau khi đăng nhập, thiết bị đó được giữ phiên tối đa 2 ngày. Bấm nút đăng xuất trên thanh công cụ để xoá phiên sớm hơn.

## Luồng nghiệp vụ chính

1. Nhập điện thoại cũ vào hệ thống với trạng thái đã cọc/chờ nhận.
2. Ghi nhận thông tin nhập hàng gồm hãng, model, tên người mua, giá mua, tiền cọc, phí vận chuyển, tình trạng, ghi chú và ảnh sản phẩm upload.
3. Quản lý danh mục linh kiện ở luồng riêng: tên linh kiện, danh mục, model tương thích, tồn tối thiểu và nhà cung cấp.
4. Nhập kho linh kiện theo từng lần nhập: số lượng, đơn giá, ngày giờ nhập, nhà cung cấp và ghi chú. Một linh kiện có thể có nhiều lần nhập với nhiều mức giá khác nhau.
5. Hệ thống lưu lịch sử nhập của từng linh kiện, cộng tồn kho và cập nhật giá nhập mới nhất để tính chi phí sửa chữa.
6. Có trang lịch sử nhập kho chi tiết để lọc, xem tổng tiền nhập và xoá từng phiếu nhập khi nhập sai.
7. Khi nhận được hàng, bấm “Đã nhận” để chuyển máy sang chờ kiểm tra.
8. Ở trạng thái chờ kiểm tra, bấm “Thay linh kiện”, chọn linh kiện cần thay; sau khi lưu, máy chuyển sang chờ sửa.
9. Khi sửa xong, bấm “Sửa xong” để chuyển máy sang sẵn sàng bán. Giao diện điện thoại chỉ cho chuyển tối đa tới trạng thái này.
10. Hệ thống hiển thị giá nhập máy, tiền cọc, phí vận chuyển, tổng chi phí thay linh kiện và tổng vốn.
11. Giá bán ra, tiền cọc bán hàng, ngày giờ bán, thông tin khách hàng, số điện thoại, địa chỉ và trạng thái vận chuyển chỉ cập nhật ở bước bán hàng; chức năng đề xuất giá bán sẽ làm sau.
12. Theo dõi lịch sử mua của từng khách hàng.

## Tính năng đã có

- Tổng quan chỉ số và biểu đồ theo tháng
- Màn hình đăng nhập và giữ phiên 2 ngày theo từng thiết bị
- Mục nhập điện thoại riêng cho máy chờ nhận, gồm thêm máy nhập, sửa thông tin nhập, đánh dấu đã nhận và xoá phiếu nhập máy
- Mục kiểm tra & sửa chữa riêng cho máy chờ kiểm tra/chờ sửa/đang sửa, gồm thay linh kiện, thêm/xoá linh kiện sửa chữa và chuyển máy sang sẵn sàng bán
- Mục sẵn sàng bán riêng để set giá bán dự kiến, đưa máy về chờ sửa hoặc chuyển sang form bán hàng
- CRUD danh mục linh kiện, nhập kho nhiều lần/nhiều giá, trạng thái từng phiếu nhập, trang lịch sử nhập có xoá phiếu và cảnh báo sắp hết
- Chọn linh kiện thay thế cho từng điện thoại và tự trừ tồn kho
- Tự tính giá nhập máy, phí vận chuyển, chi phí thay linh kiện, công sửa và tổng vốn
- Bán hàng lưu tiền cọc, ngày giờ bán, khách hàng/địa chỉ và trạng thái vận chuyển
- Đơn không nhận hàng không tính vào doanh thu/lợi nhuận và tự chuyển máy lại về sẵn sàng bán
- Lịch sử mua của khách hàng
- Log hệ thống trong Cài đặt
- Thùng rác riêng theo từng phần để khôi phục dữ liệu đã xoá
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
