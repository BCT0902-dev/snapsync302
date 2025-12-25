// BCT0902
/**
 * HƯỚNG DẪN SỬ DỤNG:
 * 1. Lấy mã CODE mới (làm lại bước dán link vào trình duyệt ẩn danh).
 * 2. Điền 3 thông tin bên dưới (giữa hai dấu ngoặc kép "").
 * 3. Mở Terminal, chạy lệnh: node setup-token.js
 */

// --- ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY ---
const CLIENT_ID = "";      // Ví dụ: "a1b2c3d4-..."
const CLIENT_SECRET = "";  // QUAN TRỌNG: Copy cột 'Value', KHÔNG copy 'Secret ID'
const CODE = "";           // Mã Code siêu dài vừa lấy được (bắt đầu bằng 0.A...)
const REDIRECT_URI = "http://localhost"; // Phải khớp y hệt trong Azure Portal
// ---------------------------------------

const https = require('https');

if (!CLIENT_ID || !CLIENT_SECRET || !CODE) {
  console.error("\x1b[31m%s\x1b[0m", "LỖI: Bạn chưa điền đủ thông tin (CLIENT_ID, CLIENT_SECRET, CODE) vào file setup-token.js");
  process.exit(1);
}

const data = new URLSearchParams({
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  code: CODE,
  redirect_uri: REDIRECT_URI,
  grant_type: "authorization_code"
}).toString();

const options = {
  hostname: 'login.microsoftonline.com',
  path: '/common/oauth2/v2.0/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': data.length
  }
};

console.log("Đang kết nối tới Microsoft...");

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      
      if (res.statusCode === 200 && json.refresh_token) {
        console.log("\n" + "=".repeat(50));
        console.log("\x1b[32m%s\x1b[0m", ">>> THÀNH CÔNG! COPY MÃ DƯỚI ĐÂY VÀO VERCEL <<<");
        console.log("=".repeat(50) + "\n");
        console.log(json.refresh_token);
        console.log("\n" + "=".repeat(50));
      } else {
        console.log("\n\x1b[31m%s\x1b[0m", ">>> THẤT BẠI <<<");
        console.log("Lỗi: " + (json.error_description || json.error));
        console.log("Chi tiết:", json);
        
        if (json.error === 'invalid_client') {
            console.log("\n-> Gợi ý: Kiểm tra lại CLIENT_SECRET. Bạn có chắc đã copy cột 'Value' chưa?");
        }
        if (json.error === 'invalid_grant') {
            console.log("\n-> Gợi ý: Mã CODE có thể đã hết hạn hoặc đã được sử dụng. Hãy lấy mã CODE mới.");
        }
      }
    } catch (e) {
      console.error("Lỗi phân tích phản hồi:", e);
    }
  });
});

req.on('error', (error) => {
  console.error("Lỗi kết nối:", error);
});

req.write(data);
req.end();