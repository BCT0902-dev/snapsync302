
import { AppConfig, User, SystemConfig, PhotoRecord, UploadStatus } from '../types';
import { INITIAL_USERS } from './mockAuth';

// Cấu hình mặc định
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  appName: "SnapSync 302",
  logoUrl: "/logo302.png", // Sử dụng file nội bộ
  themeColor: "#059669" // Emerald 600
};

/**
 * Hàm gọi về Backend của chính mình (/api/token) để lấy Access Token mới nhất
 * Export để dùng ở App.tsx cho việc fetch ảnh secure
 */
export const getAccessToken = async (): Promise<string> => {
  try {
    const response = await fetch('/api/token');
    
    // Check for 404 (API Route not found)
    if (response.status === 404) {
      throw new Error("API_NOT_FOUND");
    }
    
    // Kiểm tra Content-Type trước khi parse JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Invalid API Response (Not JSON). Status: ${response.status}. Content: ${text.substring(0, 100)}...`);
    }

    const data = await response.json();
    
    if (!response.ok || !data.accessToken) {
      throw new Error(data.error || "Không thể lấy Access Token từ server");
    }
    
    return data.accessToken;
  } catch (error) {
    // Only log error if it's not a 404 check
    if ((error as Error).message !== "API_NOT_FOUND") {
      console.error("Token Fetch Error:", error);
    }
    throw error;
  }
};

/**
 * SYSTEM: Tải danh sách User từ OneDrive (Giả lập Database)
 */
export const fetchUsersFromOneDrive = async (config: AppConfig): Promise<User[]> => {
  if (config.simulateMode) return INITIAL_USERS;

  try {
    const token = await getAccessToken();
    // Đường dẫn file DB: SnapSync302/System/users.json
    const dbPath = `${config.targetFolder}/System/users.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) {
      console.log("Chưa có database, dùng mặc định.");
      return INITIAL_USERS;
    }

    if (!response.ok) throw new Error("Lỗi tải dữ liệu người dùng");

    const users = await response.json();
    return Array.isArray(users) ? users : INITIAL_USERS;

  } catch (error) {
    console.warn("Không thể tải users từ cloud, dùng fallback:", error);
    return INITIAL_USERS;
  }
};

/**
 * SYSTEM: Lưu danh sách User lên OneDrive
 */
export const saveUsersToOneDrive = async (users: User[], config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;

  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/users.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;

    const content = JSON.stringify(users, null, 2);

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: content,
    });

    return response.ok;
  } catch (error) {
    console.error("Lỗi lưu dữ liệu người dùng:", error);
    return false;
  }
};

/**
 * SYSTEM CONFIG: Tải cấu hình App (Logo, Tên, Màu)
 */
export const fetchSystemConfig = async (config: AppConfig): Promise<SystemConfig> => {
  if (config.simulateMode) return DEFAULT_SYSTEM_CONFIG;

  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/config.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return DEFAULT_SYSTEM_CONFIG;
    if (!response.ok) throw new Error("Lỗi tải cấu hình hệ thống");

    const data = await response.json();
    // Force logoUrl to be local file regardless of what's in DB to ensure consistency
    return { ...DEFAULT_SYSTEM_CONFIG, ...data, logoUrl: "/logo302.png" }; 
  } catch (error) {
    console.warn("Dùng cấu hình mặc định:", error);
    return DEFAULT_SYSTEM_CONFIG;
  }
};

/**
 * SYSTEM CONFIG: Lưu cấu hình App
 */
export const saveSystemConfig = async (sysConfig: SystemConfig, config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;

  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/config.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;

    // Đảm bảo luôn lưu logoUrl là file tĩnh
    const configToSave = { ...sysConfig, logoUrl: "/logo302.png" };
    const content = JSON.stringify(configToSave, null, 2);

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: content,
    });

    return response.ok;
  } catch (error) {
    console.error("Lỗi lưu cấu hình:", error);
    return false;
  }
};

/**
 * Hàm upload file lên OneDrive
 */
export const uploadToOneDrive = async (
  file: File, 
  config: AppConfig,
  user: User | null
): Promise<{ success: boolean; url?: string; error?: string }> => {
  
  if (config.simulateMode) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, url: "https://onedrive.live.com/mock-link/" + file.name });
      }, 1500);
    });
  }

  try {
    if (!user) throw new Error("Chưa đăng nhập");

    const token = await getAccessToken();

    // Format: SnapSync302 / [Đơn vị] / [Username] / T[Tháng]
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const monthFolder = `T${currentMonth}`; 
    
    const unitFolder = user.unit || 'Unknown_Unit';
    const userFolder = user.username;
    
    const fullPath = `${config.targetFolder}/${unitFolder}/${userFolder}/${monthFolder}`;
    
    const fileName = `${Date.now()}_${file.name}`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}/${fileName}:/content`;

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
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

/**
 * HISTORY: Lấy danh sách file kèm thumbnails
 */
export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
  if (config.simulateMode) return [];

  try {
    const token = await getAccessToken();
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const monthFolder = `T${currentMonth}`;
    const unitFolder = user.unit || 'Unknown_Unit';
    
    const path = `${config.targetFolder}/${unitFolder}/${user.username}/${monthFolder}`;
    
    // expand=thumbnails để lấy link ảnh thu nhỏ
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children?expand=thumbnails`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error("Lỗi tải lịch sử file");

    const data = await response.json();
    
    const records: PhotoRecord[] = data.value.map((item: any) => {
      let thumbnailUrl = '';
      if (item.thumbnails && item.thumbnails.length > 0) {
        // Ưu tiên ảnh medium
        const t = item.thumbnails[0];
        thumbnailUrl = t.medium?.url || t.large?.url || t.small?.url || '';
      }

      return {
        id: item.id,
        fileName: item.name,
        status: UploadStatus.SUCCESS,
        uploadedUrl: item.webUrl,
        timestamp: new Date(item.createdDateTime),
        size: item.size,
        previewUrl: thumbnailUrl 
      };
    });

    return records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  } catch (error) {
    console.error("Fetch Recent Files Error:", error);
    return [];
  }
};

/**
 * SHARE: Lấy danh sách thư mục tháng
 */
export const listUserMonthFolders = async (config: AppConfig, user: User) => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const unitFolder = user.unit || 'Unknown_Unit';
    const path = `${config.targetFolder}/${unitFolder}/${user.username}`;
    
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error("Lỗi tải danh sách thư mục");

    const data = await response.json();
    return data.value.filter((item: any) => item.folder);
  } catch (error) {
    console.error("List Folders Error:", error);
    return [];
  }
};

/**
 * SHARE: Lấy danh sách file trong thư mục
 */
export const listFilesInMonthFolder = async (config: AppConfig, user: User, monthName: string) => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const unitFolder = user.unit || 'Unknown_Unit';
    const path = `${config.targetFolder}/${unitFolder}/${user.username}/${monthName}`;
    
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error("Lỗi tải danh sách file");

    const data = await response.json();
    return data.value;
  } catch (error) {
    console.error("List Files Error:", error);
    return [];
  }
};

/**
 * SHARE: Tạo link chia sẻ
 */
export const createShareLink = async (config: AppConfig, user: User, relativePath: string) => {
  if (config.simulateMode) return "https://mock-share-link.com";
  
  try {
    const token = await getAccessToken();
    const unitFolder = user.unit || 'Unknown_Unit';
    const fullPath = `${config.targetFolder}/${unitFolder}/${user.username}/${relativePath}`;

    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}:/createLink`;

    const body = { type: 'view', scope: 'anonymous' };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
        if (data.error?.code === 'notAllowed') {
            const retryRes = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'view', scope: 'organization' })
            });
            const retryData = await retryRes.json();
            if (retryRes.ok) return retryData.link.webUrl;
        }
        throw new Error(data.error?.message || "Không thể tạo link chia sẻ");
    }

    return data.link.webUrl;
  } catch (error) {
    console.error("Create Link Error:", error);
    throw error;
  }
};
