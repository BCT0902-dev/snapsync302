
export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // Chỉ chấp nhận GET request từ tên miền của chính mình (bảo mật cơ bản)
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Lấy các biến môi trường từ cấu hình Vercel
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const refreshToken = process.env.AZURE_REFRESH_TOKEN; // Token vĩnh viễn (lấy 1 lần đầu)
  // Với tài khoản E5, nên dùng tenant ID cụ thể nếu có, hoặc để 'common' cũng thường hoạt động nếu app set là multitenant
  const tenantId = process.env.AZURE_TENANT_ID || 'common';

  if (!clientId || !clientSecret || !refreshToken) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: Missing env vars on Vercel' }), { status: 500 });
  }

  try {
    // Gọi sang Microsoft để đổi Refresh Token lấy Access Token mới
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    // Scope phải khớp với lúc xin quyền ban đầu
    params.append('scope', 'Files.ReadWrite.All offline_access User.Read');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Token refresh failed:", data);
      
      // Bắt lỗi cụ thể sai Client Secret để báo cho Admin dễ sửa
      if (data.error === 'invalid_client' || (data.error_description && data.error_description.includes('AADSTS7000215'))) {
         return new Response(JSON.stringify({ 
          error: 'Cấu hình sai AZURE_CLIENT_SECRET. Hãy chắc chắn bạn đã copy cột "Value" chứ không phải "Secret ID" trên Azure Portal.',
          details: data 
        }), { status: 500 });
      }

      return new Response(JSON.stringify({ 
        error: data.error_description || 'Failed to refresh token',
        details: data 
      }), { status: 400 });
    }

    // Trả về Access Token cho Frontend
    return new Response(JSON.stringify({ accessToken: data.access_token }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Internal Error:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}