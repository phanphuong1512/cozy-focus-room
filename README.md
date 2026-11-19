# Căn Phòng Kỷ Niệm 💕 - Game KAPLAY Dành Tặng Người Yêu

Một tựa game 2D Cozy Puzzle nhỏ nhắn, ấm cúng và đầy ngọt ngào được xây dựng bằng **KAPLAY** và **Vite**.

---

## 🎮 Cách Chơi

* **Điều khiển:**
  * **Máy tính:** Dùng các phím mũi tên hoặc `W`, `A`, `S`, `D` để di chuyển. Nhấn `Space` hoặc `E` để tương tác khi lại gần đồ vật.
  * **Điện thoại:** Sử dụng cụm phím ảo D-Pad ở góc trái và nút ❤️ `[E]` ở góc phải.
* **Mục tiêu:**
  * Khám phá căn phòng và giải **3 câu đố tình yêu** để thu thập đủ 3 chiếc chìa khóa:
    1. 🕯️ **Chìa khóa Đỏ:** Thắp sáng ngọn nến thơm và trả lời câu hỏi trắc nghiệm ngọt ngào.
    2. 📺 **Chìa khóa Vàng:** Bật chiếc TV hoài niệm và nhập mã số tình yêu (mặc định: `1314`).
    3. 🪴 **Chìa khóa Xanh:** Đẩy chậu cây mầm xanh vào vị trí đánh dấu giữa tấm thảm ấm áp.
  * Mở chiếc **Hộp Quà Kỷ Niệm 🎁** ở góc phòng để mở khóa **Bức Thư Tình Bí Mật** kèm **3 Voucher Tình Yêu**!

---

## ✏️ Tùy Chỉnh Nội Dung Dễ Dàng (Trong file `src/config.js`)

Mọi câu chữ trong game đã được thiết kế để bạn có thể cá nhân hóa 100% chỉ trong 1 phút:

1. **Tên / Biệt danh của 2 bạn:**
   ```js
   senderName: "Anh",
   receiverName: "Em Bé",
   ```
2. **Câu đố Nến thơm (Câu hỏi & Đáp án):**
   ```js
   puzzle1: {
     question: "Khi ở bên cạnh em, điều gì làm anh cảm thấy hạnh phúc nhất?",
     options: [ ... ],
     correctAnswerIndex: 2,
   }
   ```
3. **Mã số bí mật TV (Ngày kỷ niệm, ngày sinh nhật,...):**
   ```js
   puzzle2: {
     passcode: "1314", // Bạn có thể đổi thành ngày kỷ niệm, ví dụ "2010"
   }
   ```
4. **Nội dung Bức Thư Tình & Các Phiếu Quà Tặng (Vouchers):**
   Chỉnh sửa các đoạn văn trong `loveLetter.paragraphs` và `loveLetter.vouchers`.

---

## 🚀 Khởi Chạy & Đóng Gói (Deploy)

* **Chạy thử nghiệm (Dev Server):**
  ```bash
  npm run dev
  ```
  Truy cập: `http://localhost:5173/` (hoặc mở trên điện thoại cùng mạng Wi-Fi qua địa chỉ IP local).

* **Đóng gói để xuất bản (Build):**
  ```bash
  npm run build
  ```
  Thư mục `dist/` đã sẵn sàng để bạn tải lên bất kỳ nền tảng miễn phí nào như **Vercel**, **Netlify**, hoặc **GitHub Pages** để tạo link web hoặc mã QR in lên thiệp tặng!
