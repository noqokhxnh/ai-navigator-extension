# Gemini Navigator

🧭 Browser extension để điều hướng nhanh trong cuộc trò chuyện Gemini AI.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/Firefox-Compatible-orange.svg)
![Chrome](https://img.shields.io/badge/Chrome-Compatible-green.svg)

## Tổng quan

Gemini Navigator giúp bạn dễ dàng điều hướng qua các tin nhắn trong cuộc trò chuyện dài với Gemini AI. Extension hiển thị danh sách tất cả tin nhắn (cả User và AI) ở dạng menu nhỏ gọn bên phải màn hình.

## Tính năng

✅ **Dual Message Detection** - Hiển thị cả User (U) và AI (A) messages  
✅ **Floating Icon** - Icon 📍 nhỏ gọn mặc định, click để mở  
✅ **Quick Navigation** - Click vào bất kỳ tin nhắn nào để cuộn đến  
✅ **Resizable** - Kéo góc để điều chỉnh kích thước  
✅ **Auto Save** - Lưu kích thước tự động  
✅ **Optimized** - CSS tối ưu cho hiệu suất tốt  

## Cài đặt

### Firefox

**Option 1: Install .xpi file (Permanent)**

```bash
# Bước 1: Tắt kiểm tra chữ ký
# 1. Mở about:config trên thanh tìm kiếm
# 2. Tìm: xpinstall.signatures.required
# 3. Đổi true → false bằng cách click đúp 

# Bước 2: Cài extension
# 1. Ctrl + Shift + A → Add-ons Manager
# 2. ⚙️ Settings → Install Add-on From File...
# 3. Chọn gemini-navigator.xpi
```

**Option 2: Developer mode (Temporary)**

```bash
# 1. Mở about:debugging
# 2. Load Temporary Add-on
# 3. Chọn gemini-firefox/manifest.json
```

### Chrome

```bash
# 1. Mở chrome://extensions/
# 2. Bật Developer mode
# 3. Click "Load unpacked"
# 4. Chọn folder gemini-chrome/
```

## Cấu trúc Project

```
gemini-navigator-extension/
├── gemini-firefox/              # Firefox version (Manifest V2)
│   ├── manifest.json
│   ├── content.js
│   ├── styles.css
│   ├── icons/
│   └── README.md
├── gemini-chrome/               # Chrome version (Manifest V3)
│   ├── manifest.json
│   ├── content.js              # + browser/chrome shim
│   ├── styles.css
│   ├── icons/
│   └── README.md
├── gemini-navigator.xpi         # Firefox package
├── gemini-navigator-chrome.zip  # Chrome package
└── README.md                    # File này
```

## Sử dụng

1. Mở [gemini.google.com](https://gemini.google.com/)
2. Bắt đầu chat (cần tối thiểu 3 tin nhắn)
3. Icon 📍 xuất hiện bên phải
4. Click để mở/đóng menu
5. Click vào tin nhắn bất kỳ để nhảy đến

## Development

### Build Firefox Package

```bash
cd gemini-firefox
zip -r ../gemini-navigator.xpi manifest.json content.js styles.css icons/ README.md
```

### Build Chrome Package

```bash
zip -r gemini-navigator-chrome.zip gemini-chrome/
```

## Khác biệt giữa Firefox và Chrome version

| Tính năng | Firefox | Chrome |
|-----------|---------|--------|
| Manifest Version | V2 | V3 |
| API namespace | `browser.*` | `chrome.*` (with shim) |
| Package format | `.xpi` | `.zip` |
| Specific settings | `browser_specific_settings.gecko.id` | ❌ |

## Screenshots

*Extension ở chế độ minimized*  
📍 Icon nhỏ ở bên phải

*Extension ở chế độ expanded*  
Danh sách đầy đủ các tin nhắn U/A

## License

MIT License - xem file LICENSE để biết chi tiết

## Tác giả

[@khxnh](https://github.com/khxnh)

## Đóng góp

Pull requests are welcome! Để thay đổi lớn, vui lòng mở issue trước.

## Changelog

### v1.0.0 (2026-01-11)
- ✨ Initial release
- ✅ Firefox và Chrome support
- ✅ User + AI message detection
- ✅ Minimize/expand functionality
- ✅ Resize support
- ✅ Auto-save settings
