
import { AppConfig, User } from '../types';
import { INITIAL_USERS } from './mockAuth';

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
      // Nếu chưa có file DB, trả về user mặc định (Admin)
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
    
    // Đường dẫn đơn vị: Graph API sẽ tự tạo folder con nếu chuỗi chứa dấu "/"
    // VD: user.unit = "Trung đoàn 88/Tiểu đoàn 4" -> Folder Trung đoàn 88 -> Folder Tiểu đoàn 4
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
