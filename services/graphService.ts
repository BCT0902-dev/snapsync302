import { AppConfig } from '../types';

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
  subFolder: string = "" // Cho phép chia thư mục theo user
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
    // Bước A: Lấy Token mới
    const token = await getFreshAccessToken();

    // Bước B: Chuẩn bị đường dẫn (Folder gốc / Tên User / File)
    const finalFolder = subFolder ? `${config.targetFolder}/${subFolder}` : config.targetFolder;
    const fileName = `${Date.now()}_${file.name}`;
    
    // API Endpoint: Upload file nhỏ (<4MB). Với file lớn hơn cần dùng Upload Session (để sau)
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${finalFolder}/${fileName}:/content`;

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