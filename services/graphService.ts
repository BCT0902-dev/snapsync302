
import { AppConfig, User, SystemConfig, PhotoRecord, UploadStatus } from '../types';
import { INITIAL_USERS } from './mockAuth';

// Cấu hình mặc định
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  appName: "SnapSync 302",
  logoUrl: "https://cdn-icons-png.flaticon.com/512/6534/6534062.png",
  themeColor: "#059669" // Emerald 600
};

/**
 * Hàm gọi về Backend của chính mình (/api/token) để lấy Access Token mới nhất
 */
const getFreshAccessToken = async (): Promise<string> => {
  try {
    const response = await fetch('/api/token');
    
    // Kiểm tra Content-Type trước khi parse JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      // Nếu không phải JSON (ví dụ: HTML lỗi 404/500 hoặc text), ném lỗi rõ ràng
      const text = await response.text();
      // Lấy 100 ký tự đầu để debug
      throw new Error(`Invalid API Response (Not JSON). Status: ${response.status}. Content: ${text.substring(0, 100)}...`);
    }

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
 * SYSTEM: Tải danh sách User từ OneDrive (Giả lập Database)
 */
export const fetchUsersFromOneDrive = async (config: AppConfig): Promise<User[]> => {
  if (config.simulateMode) return INITIAL_USERS;

  try {
    const token = await getFreshAccessToken();
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
    const token = await getFreshAccessToken();
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
    const token = await getFreshAccessToken();
    const dbPath = `${config.targetFolder}/System/config.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return DEFAULT_SYSTEM_CONFIG;
    if (!response.ok) throw new Error("Lỗi tải cấu hình hệ thống");

    const data = await response.json();
    return { ...DEFAULT_SYSTEM_CONFIG, ...data }; // Merge với default để tránh lỗi thiếu trường
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
    const token = await getFreshAccessToken();
    const dbPath = `${config.targetFolder}/System/config.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;

    const content = JSON.stringify(sysConfig, null, 2);

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
 * SYSTEM LOGO: Upload logo và trả về Direct Link
 */
export const uploadSystemLogo = async (file: File, config: AppConfig): Promise<string> => {
  if (config.simulateMode) return URL.createObjectURL(file);

  try {
    const token = await getFreshAccessToken();
    // Đặt tên file duy nhất để tránh cache, sử dụng timestamp
    const fileName = `Logo_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const fullPath = `${config.targetFolder}/System/${fileName}`;

    // 1. Upload File
    const uploadEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}:/content`;
    const uploadRes = await fetch(uploadEndpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!uploadRes.ok) throw new Error("Lỗi upload logo lên server");

    // 2. Tạo Share Link (Anonymous)
    const createLinkEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}:/createLink`;
    const linkBody = { type: 'view', scope: 'anonymous' };
    
    let shareLinkUrl = '';
    
    const linkRes = await fetch(createLinkEndpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(linkBody)
    });

    if (linkRes.ok) {
        const linkData = await linkRes.json();
        shareLinkUrl = linkData.link.webUrl;
    } else {
        // Fallback: Thử organization nếu anonymous bị cấm
        const retryRes = await fetch(createLinkEndpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'view', scope: 'organization' })
        });
        if(retryRes.ok) {
            const retryData = await retryRes.json();
            shareLinkUrl = retryData.link.webUrl;
        } else {
            throw new Error("Không thể tạo link chia sẻ cho Logo");
        }
    }

    // 3. Biến đổi Share Link thành Direct Download Link chuẩn xác hơn
    // Sử dụng URL API để parse và set query param an toàn
    try {
        const urlObj = new URL(shareLinkUrl);
        urlObj.searchParams.set('download', '1');
        return urlObj.toString();
    } catch (e) {
        // Fallback thủ công nếu URL không parse được
        const separator = shareLinkUrl.includes('?') ? '&' : '?';
        return `${shareLinkUrl}${separator}download=1`;
    }

  } catch (error) {
    console.error("Upload Logo Error:", error);
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
  
  if (config.simulateMode) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, url: "https://onedrive.live.com/mock-link/" + file.name });
      }, 1500);
    });
  }

  try {
    if (!user) throw new Error("Chưa đăng nhập");

    const token = await getFreshAccessToken();

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
 * HISTORY: Lấy danh sách file đã upload trong tháng hiện tại để hiện thị ở Lịch sử/Hoạt động gần đây
 */
export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
  if (config.simulateMode) return [];

  try {
    const token = await getFreshAccessToken();
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const monthFolder = `T${currentMonth}`;
    const unitFolder = user.unit || 'Unknown_Unit';
    
    // Path: SnapSync302/Unit/Username/Txx
    const path = `${config.targetFolder}/${unitFolder}/${user.username}/${monthFolder}`;
    
    // SỬA: Loại bỏ 'select' để đảm bảo lấy đủ dữ liệu thumbnails và metadata. 
    // Khi dùng 'select', nếu API version thay đổi hoặc trường 'thumbnails' không nằm trong core set, nó có thể bị miss.
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children?expand=thumbnails`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return []; // Chưa có thư mục tháng này
    if (!response.ok) throw new Error("Lỗi tải lịch sử file");

    const data = await response.json();
    
    // Map OneDrive item sang PhotoRecord
    const records: PhotoRecord[] = data.value.map((item: any) => {
      // Lấy thumbnail robust hơn: tìm bất kỳ size nào có sẵn
      let thumbnailUrl = '';
      if (item.thumbnails && item.thumbnails.length > 0) {
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

    // Sắp xếp mới nhất lên đầu
    return records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  } catch (error) {
    console.error("Fetch Recent Files Error:", error);
    return [];
  }
};

/**
 * SHARE: Lấy danh sách thư mục tháng của User (VD: T01, T12)
 */
export const listUserMonthFolders = async (config: AppConfig, user: User) => {
  if (config.simulateMode) return [];
  try {
    const token = await getFreshAccessToken();
    const unitFolder = user.unit || 'Unknown_Unit';
    const path = `${config.targetFolder}/${unitFolder}/${user.username}`;
    
    // API list children
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return []; // Chưa có thư mục
    if (!response.ok) throw new Error("Lỗi tải danh sách thư mục");

    const data = await response.json();
    // Chỉ lấy folder
    return data.value.filter((item: any) => item.folder);
  } catch (error) {
    console.error("List Folders Error:", error);
    return [];
  }
};

/**
 * SHARE: Lấy danh sách file trong một thư mục cụ thể (theo ID thư mục hoặc đường dẫn)
 * Ở đây ta dùng đường dẫn tương đối cho tiện: T12
 */
export const listFilesInMonthFolder = async (config: AppConfig, user: User, monthName: string) => {
  if (config.simulateMode) return [];
  try {
    const token = await getFreshAccessToken();
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
 * SHARE: Tạo link chia sẻ (Anonymous View) cho file hoặc folder
 * Path format relative to root: SnapSync302/Unit/User/Folder
 */
export const createShareLink = async (config: AppConfig, user: User, relativePath: string) => {
  if (config.simulateMode) return "https://mock-share-link.com";
  
  try {
    const token = await getFreshAccessToken();
    // Xây dựng đường dẫn đầy đủ từ root
    const unitFolder = user.unit || 'Unknown_Unit';
    const fullPath = `${config.targetFolder}/${unitFolder}/${user.username}/${relativePath}`;

    // Endpoint tạo link: POST /drive/root:/{path}:/createLink
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}:/createLink`;

    const body = {
      type: 'view',
      scope: 'anonymous' // Cho phép khách xem không cần login
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
        // Nếu lỗi do Tenant cấm anonymous, thử fallback sang organization
        if (data.error?.code === 'notAllowed') {
            const retryBody = { type: 'view', scope: 'organization' };
            const retryRes = await fetch(endpoint, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(retryBody)
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
