# Gemini Navigator - Firefox Extension

🧭 Điều hướng nhanh trong cuộc trò chuyện Gemini AI của bạn!

## Tính năng

- 📍 **Icon nhỏ bên phải** - Mặc định ở chế độ thu nhỏ
- 📋 **Danh sách tin nhắn** - Hiển thị cả User (U) và AI (A)
- 🔍 **Click để nhảy** - Nhấn vào tin nhắn bất kỳ để cuộn đến
- 📏 **Resize** - Kéo góc dưới phải để thay đổi kích thước
- 💾 **Lưu tự động** - Kích thước được lưu giữa các phiên

## Cài đặt

### Cách 1: Từ file .xpi (Permanent)

#### Bước 1: Tắt kiểm tra chữ ký (cho Firefox/Zen Browser)

1. Mở Firefox/Zen Browser
2. Nhập `about:config` vào thanh địa chỉ → Enter
3. Nhấn "Accept the Risk and Continue"
4. Tìm kiếm: `xpinstall.signatures.required`
5. Nhấp đúp để đổi từ `true` → `false`

#### Bước 2: Cài đặt Extension

1. Nhấn `Ctrl + Shift + A` để mở Add-ons Manager
2. Click vào icon ⚙️ (Settings) → "Install Add-on From File..."
3. Chọn file `gemini-navigator.xpi`
4. Click "Add" để xác nhận

**Hoặc**: Kéo file `.xpi` trực tiếp vào cửa sổ Add-ons

### Cách 2: Load tạm thời (Developer)

1. Mở Firefox → `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Chọn file `manifest.json` trong folder `gemini-firefox`

> **Lưu ý**: Extension tạm thời sẽ mất khi đóng browser

## Sử dụng

1. Mở [gemini.google.com](https://gemini.google.com/)
2. Bắt đầu chat (cần ít nhất 3 tin nhắn)
3. Icon 📍 sẽ xuất hiện bên phải
4. Click icon để mở menu đầy đủ
5. Click − để thu nhỏ lại

## Cấu trúc

```
gemini-firefox/
├── manifest.json     # Cấu hình extension
├── content.js        # Logic chính
├── styles.css        # Giao diện
├── icons/            # Icon extension
└── README.md         # File này
```

## License

MIT License

## Tác giả

[@khxnh](https://github.com/khxnh)
