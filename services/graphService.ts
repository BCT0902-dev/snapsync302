
import { AppConfig, User } from '../types';

/**
 * Hàm gọi về Backend của chính mình (/api/token) để lấy Access Token mới nhất
 */
const getFreshAccessToken = async (): Promise<string> => {
  try {
    const response = await fetch('/api/token');
    const data = await response.json();
    
    if (!response.ok || !data.accessToken) {
      throw new Error(data.error || "Không thể lấy Access Token từ server");
    }
    
    return data.accessToken;
  } catch (error) {
    console.error("Token Fetch Error:", error);
    throw error;
  }
};

/**
 * Hàm upload file lên OneDrive dùng Microsoft Graph API
 */
export const uploadToOneDrive = async (
  file: File, 
  config: AppConfig,
  user: User | null
): Promise<{ success: boolean; url?: string; error?: string }> => {
  
  // 1. Chế độ giả lập
  if (config.simulateMode) {
    console.log(`[SIMULATION] Uploading ${file.name}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, url: "https://onedrive.live.com/mock-link/" + file.name });
      }, 1500);
    });
  }

  // 2. Chế độ thật: Tự động lấy Token từ Backend
  try {
    if (!user) throw new Error("Chưa đăng nhập");

    // Bước A: Lấy Token mới
    const token = await getFreshAccessToken();

    // Bước B: Chuẩn bị đường dẫn 
    // Format: SnapSync302 / [Đơn vị] / [Username] / [Ngày tháng]
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const unitFolder = user.unit || 'Unknown_Unit';
    const userFolder = user.username;
    
    // Đường dẫn đầy đủ
    const fullPath = `${config.targetFolder}/${unitFolder}/${userFolder}/${today}`;
    const fileName = `${Date.now()}_${file.name}`;
    
    // API Endpoint
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}/${fileName}:/content`;

    // Bước C: Upload
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || response.statusText);
    }

    const data = await response.json();
    return { success: true, url: data.webUrl };

  } catch (error: any) {
    console.error("OneDrive Upload Error:", error);
    return { success: false, error: error.message };
  }
};