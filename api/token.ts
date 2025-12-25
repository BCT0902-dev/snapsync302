// BCT0902
export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // Chỉ chấp nhận GET request
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Lấy các biến môi trường và CẮT BỎ KHOẢNG TRẮNG (Trim) để tránh lỗi copy-paste
  const clientId = (process.env.AZURE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.AZURE_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.AZURE_REFRESH_TOKEN || '').trim();
  const tenantId = (process.env.AZURE_TENANT_ID || 'common').trim();

  // Kiểm tra biến môi trường
  if (!clientId || !clientSecret || !refreshToken) {
    console.error("Missing Env Vars - ID Length:", clientId.length, "Secret Length:", clientSecret.length, "Token Length:", refreshToken.length);
    return new Response(JSON.stringify({ error: 'Server misconfiguration: Missing env vars on Vercel' }), { status: 500 });
  }

  try {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    // QUAN TRỌNG: Đã bỏ params.append('scope', ...) 
    // Khi refresh token, không cần gửi scope, Microsoft sẽ tự cấp lại scope cũ. Gửi sai scope dễ gây lỗi Malformed request.

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Token refresh failed:", data);
      
      // Phân tích lỗi để gợi ý sửa
      let advice = '';
      if (data.error === 'invalid_client') advice = 'Kiểm tra lại AZURE_CLIENT_SECRET (Value vs ID).';
      if (data.error === 'invalid_grant') advice = 'Refresh Token đã hết hạn hoặc bị thu hồi. Cần lấy lại token mới.';
      if (data.error === 'invalid_request') advice = 'Request bị lỗi định dạng (thường do thừa khoảng trắng trong Env Vars).';

      return new Response(JSON.stringify({ 
        error: data.error_description || 'Failed to refresh token',
        details: data,
        advice: advice
      }), { status: 400 });
    }

    // Trả về Access Token cho Frontend
    return new Response(JSON.stringify({ accessToken: data.access_token }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Internal Error:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), { status: 500 });
  }
}