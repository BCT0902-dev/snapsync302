
import { AppConfig, User, SystemConfig, PhotoRecord, UploadStatus, CloudItem, SystemStats } from '../types';
import { INITIAL_USERS } from './mockAuth';

// Cấu hình mặc định
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  appName: "Mediaf302",
  logoUrl: "/logo302.svg", // Fallback ban đầu
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
    // BỎ FORCE LOGO: Sử dụng dữ liệu từ Cloud nếu có, nếu không thì dùng mặc định
    return { ...DEFAULT_SYSTEM_CONFIG, ...data }; 
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

    // Lưu toàn bộ config bao gồm cả logoUrl (có thể là base64 string)
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
 * ADMIN: Lấy thống kê hệ thống (Files, Dung lượng)
 */
export const fetchSystemStats = async (config: AppConfig): Promise<Partial<SystemStats>> => {
    if (config.simulateMode) {
        return { totalFiles: 150, totalStorage: 1024 * 1024 * 500 }; // 500MB Mock
    }

    try {
        const token = await getAccessToken();
        const rootPath = config.targetFolder;
        
        // 1. Lấy thông tin thư mục gốc để biết tổng dung lượng (Size của folder bao gồm con)
        const rootEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}`;
        
        const rootRes = await fetch(rootEndpoint, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const rootData = await rootRes.json();
        const totalStorage = rootData.size || 0;
        
        // 2. Đếm số lượng file chính xác bằng Delta API
        let fileCount = 0;
        let nextLink = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}:/delta?select=id,name,file,deleted`;

        while (nextLink) {
             const res = await fetch(nextLink, {
                 headers: { 'Authorization': `Bearer ${token}` }
             });
             
             if (!res.ok) {
                 console.warn("Delta query interrupted", res.statusText);
                 break;
             }

             const data = await res.json();
             
             if (data.value) {
                 for (const item of data.value) {
                     if (item.file && !item.deleted) {
                         const name = item.name.toLowerCase();
                         if (name !== 'users.json' && name !== 'config.json') {
                             fileCount++;
                         }
                     }
                 }
             }

             nextLink = data['@odata.nextLink'];
        }

        return {
            totalStorage: totalStorage,
            totalFiles: fileCount
        };

    } catch (e) {
        console.error("Error fetching stats:", e);
        return { totalFiles: 0, totalStorage: 0 };
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
    
    // --- LOGIC ĐỔI TÊN FILE "GỌN GÀNG, LOGIC" ---
    // Cũ: Date.now()_filename
    // Mới: PREFIX_YYYYMMDD_HHmmss_SSS.ext
    
    // 1. Xác định Prefix
    let prefix = 'FILE';
    if (file.type.startsWith('image/')) prefix = 'IMG';
    else if (file.type.startsWith('video/')) prefix = 'VID';
    else if (file.type.includes('pdf') || file.type.includes('word') || file.type.includes('sheet')) prefix = 'DOC';

    // 2. Xác định Extension
    const parts = file.name.split('.');
    const ext = parts.length > 1 ? parts.pop() : ''; // Lấy đuôi file gốc
    
    // 3. Format thời gian: YYYYMMDD_HHmmss_SSS (SSS để tránh trùng lặp tuyệt đối nếu up nhiều file cùng giây)
    const pad = (n: number) => n.toString().padStart(2, '0');
    const pad3 = (n: number) => n.toString().padStart(3, '0');
    
    const timeStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad3(now.getMilliseconds())}`;
    
    const cleanFileName = `${prefix}_${timeStr}${ext ? '.' + ext : ''}`;
    // ---------------------------------------------

    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}/${cleanFileName}:/content`;

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
 * ADMIN: Xóa file khỏi OneDrive
 */
export const deleteFileFromOneDrive = async (config: AppConfig, itemId: string): Promise<boolean> => {
  if (config.simulateMode) return true;

  try {
    const token = await getAccessToken();
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok && response.status !== 204) {
      const data = await response.json();
      throw new Error(data.error?.message || "Lỗi xóa file");
    }
    return true;
  } catch (error) {
    console.error("Delete Error:", error);
    return false;
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
        previewUrl: thumbnailUrl,
        mimeType: item.file?.mimeType 
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
  // Hàm cũ, vẫn giữ để tương thích ngược nếu cần, nhưng logic Gallery sẽ dùng hàm mới bên dưới
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const unitFolder = user.unit || 'Unknown_Unit';
    const path = `${config.targetFolder}/${unitFolder}/${user.username}`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children`;
    const response = await fetch(endpoint, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
    if (response.status === 404) return [];
    const data = await response.json();
    return data.value.filter((item: any) => item.folder);
  } catch (error) { return []; }
};

/**
 * SHARE: Lấy danh sách file trong thư mục
 */
export const listFilesInMonthFolder = async (config: AppConfig, user: User, monthName: string) => {
  // Hàm cũ
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const unitFolder = user.unit || 'Unknown_Unit';
    const path = `${config.targetFolder}/${unitFolder}/${user.username}/${monthName}`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children`;
    const response = await fetch(endpoint, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
    const data = await response.json();
    return data.value;
  } catch (error) { return []; }
};

/**
 * SHARE: Tạo link chia sẻ bằng Item ID (Chuẩn hơn dùng Path)
 */
export const createShareLink = async (config: AppConfig, itemId: string) => {
  if (config.simulateMode) return "https://mock-share-link.com";
  
  try {
    const token = await getAccessToken();
    
    // Sử dụng endpoint theo ID thay vì Path để tránh lỗi "Item not found" khi path phức tạp
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`;

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

/**
 * GALLERY: Duyệt nội dung thư mục động theo Path
 * Nếu relativePath = "" -> Lấy root (list các đơn vị)
 */
export const listPathContents = async (config: AppConfig, relativePath: string = ""): Promise<CloudItem[]> => {
  if (config.simulateMode) {
    // Mock data
    if (relativePath === "") return [{ id: '1', name: 'Sư đoàn 302', folder: {childCount: 1}, webUrl: '#', lastModifiedDateTime: new Date().toISOString(), size: 0 }];
    return [];
  }

  try {
    const token = await getAccessToken();
    
    // Xây dựng path đầy đủ: SnapSync302 / [relativePath]
    let path = config.targetFolder;
    if (relativePath) {
      path += `/${relativePath}`;
    }

    // expand=thumbnails để lấy ảnh hiển thị cho album
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children?expand=thumbnails`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error("Lỗi tải dữ liệu thư mục");

    const data = await response.json();
    
    return data.value.map((item: any) => {
       // Lấy thumbnail tốt nhất
       let thumb = "";
       if (item.thumbnails && item.thumbnails.length > 0) {
         thumb = item.thumbnails[0].large?.url || item.thumbnails[0].medium?.url || item.thumbnails[0].small?.url;
       }

       return {
         id: item.id,
         name: item.name,
         folder: item.folder,
         file: item.file,
         webUrl: item.webUrl,
         lastModifiedDateTime: item.lastModifiedDateTime,
         size: item.size,
         thumbnailUrl: thumb,
         downloadUrl: item['@microsoft.graph.downloadUrl']
       } as CloudItem;
    });

  } catch (error) {
    console.error("Gallery Fetch Error:", error);
    return [];
  }
};

/**
 * Helper: Duyệt đệ quy cây thư mục
 */
const crawlFolderRecursive = async (token: string, folderId: string, results: CloudItem[], user: User) => {
  try {
    // BỎ tham số select=... để đảm bảo lấy tất cả trường (bao gồm @microsoft.graph.downloadUrl)
    let nextLink = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?expand=thumbnails&top=200`;

    while (nextLink) {
      const response = await fetch(nextLink, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) break;
      
      const data = await response.json();
      
      if (data.value) {
        // Duyệt tuần tự để an toàn
        for (const item of data.value) {
            // Check bảo mật
            if (user.role !== 'admin') {
                const name = item.name.toLowerCase();
                if (name === 'system' || name === 'bo_chi_huy' || name === 'quan_tri_vien') continue;
            }

            if (item.folder) {
                // Đệ quy
                await crawlFolderRecursive(token, item.id, results, user);
            } else if (item.file) {
                // Check file ảnh/video
                const name = item.name.toLowerCase();
                if (name === 'users.json' || name === 'config.json') continue;

                const mime = item.file.mimeType || '';
                const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|heic)$/i.test(name);
                const isVideo = mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(name);

                if (isImage || isVideo) {
                    let thumb = "";
                    if (item.thumbnails && item.thumbnails.length > 0) {
                        thumb = item.thumbnails[0].large?.url || item.thumbnails[0].medium?.url || item.thumbnails[0].small?.url;
                    }
                    results.push({
                        id: item.id,
                        name: item.name,
                        file: item.file,
                        webUrl: item.webUrl,
                        lastModifiedDateTime: item.lastModifiedDateTime,
                        size: item.size,
                        thumbnailUrl: thumb,
                        downloadUrl: item['@microsoft.graph.downloadUrl']
                    });
                }
            }
        }
      }
      nextLink = data['@odata.nextLink'];
    }
  } catch (e) {
    console.error("Crawl error at folder " + folderId, e);
  }
}

/**
 * GALLERY: Lấy TOÀN BỘ file ảnh/video trong hệ thống (Recursive Crawl)
 * Thay thế phương thức Search/Delta bằng duyệt đệ quy để đảm bảo chính xác 100%.
 */
export const fetchAllMedia = async (config: AppConfig, user: User): Promise<CloudItem[]> => {
    if (config.simulateMode) {
        return [
            { id: '1', name: 'demo.jpg', file: {mimeType: 'image/jpeg'}, webUrl: '#', lastModifiedDateTime: new Date().toISOString(), size: 1024, thumbnailUrl: 'https://via.placeholder.com/150' } as CloudItem
        ];
    }

    try {
        const token = await getAccessToken();
        const rootPath = config.targetFolder;

        // 1. Lấy ID của thư mục gốc trước
        const rootEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}`;
        const rootRes = await fetch(rootEndpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (!rootRes.ok) throw new Error("Không tìm thấy thư mục gốc");
        
        const rootData = await rootRes.json();
        const rootId = rootData.id;

        const results: CloudItem[] = [];
        
        // 2. Bắt đầu duyệt đệ quy từ gốc
        await crawlFolderRecursive(token, rootId, results, user);

        return results;

    } catch (error) {
        console.error("Fetch All Media Error (Recursive):", error);
        return [];
    }
};
