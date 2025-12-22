
import { AppConfig, User, SystemConfig, PhotoRecord, UploadStatus, CloudItem, SystemStats } from '../types';
import { INITIAL_USERS } from './mockAuth';

// Cấu hình mặc định
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  appName: "Mediaf302",
  logoUrl: "/logo302.svg", // Fallback ban đầu
  themeColor: "#059669" // Emerald 600
};

/**
 * Helper: Tạo đường dẫn thư mục dựa trên chuỗi Unit
 * Logic mới: 
 * 1. Nếu bắt đầu bằng "Sư đoàn 302", bỏ phần này đi (để tránh thừa).
 * 2. Giữ nguyên các cấp còn lại để tạo cây thư mục.
 * Ví dụ: "Trung đoàn 88/Ban Tham mưu" -> "Trung đoàn 88/Ban Tham mưu"
 *        "Sư đoàn 302/Phòng Tham mưu" -> "Phòng Tham mưu"
 *        "Trung đoàn 88/Tiểu đoàn 4/Đại đội 1" -> "Trung đoàn 88/Tiểu đoàn 4/Đại đội 1"
 */
const getUnitFolderName = (unitString: string): string => {
  if (!unitString) return "Unknown_Unit";
  
  let parts = unitString.split('/').map(p => p.trim());
  
  // Nếu phần đầu là "Sư đoàn 302" và có phần con, thì bỏ phần đầu đi
  if (parts.length > 1 && parts[0].toLowerCase().includes("sư đoàn 302")) {
      parts.shift(); // Remove first element
  }
  
  // Sanitize từng phần tên thư mục (giữ lại dấu / để tạo path)
  const cleanPath = parts.map(p => p.replace(/[<>:"\\|?*]/g, "_")).join('/');
  
  return cleanPath;
}

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

    const cloudUsers = await response.json();
    const userArray = Array.isArray(cloudUsers) ? cloudUsers : [];

    // MERGE LOGIC:
    // Kết hợp user từ Cloud và Initial Users. 
    // Nếu user đã có trên Cloud thì dùng Cloud (để lấy cập nhật password/info).
    // Nếu chưa có trên Cloud (ví dụ 'thannhan' bị thiếu file) thì lấy từ Initial để đảm bảo đăng nhập được.
    
    const cloudUsernames = new Set(userArray.map((u: User) => u.username.toLowerCase()));
    const missingDefaults = INITIAL_USERS.filter(u => !cloudUsernames.has(u.username.toLowerCase()));

    return [...userArray, ...missingDefaults];

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
 * Hàm upload file lên OneDrive (Hỗ trợ file lớn > 4MB bằng Upload Session)
 */
export const uploadToOneDrive = async (
  file: File, 
  config: AppConfig,
  user: User | null,
  onProgress?: (percent: number) => void // Thêm callback progress
): Promise<{ success: boolean; url?: string; error?: string }> => {
  
  if (config.simulateMode) {
    if (onProgress) onProgress(0);
    return new Promise((resolve) => {
      setTimeout(() => { if (onProgress) onProgress(50); }, 500);
      setTimeout(() => {
        if (onProgress) onProgress(100);
        resolve({ success: true, url: "https://onedrive.live.com/mock-link/" + file.name });
      }, 1500);
    });
  }

  try {
    if (!user) throw new Error("Chưa đăng nhập");

    const token = await getAccessToken();

    // Format: SnapSync302 / [Đơn vị Cấp 1] / [Đơn vị Cấp 2] / ... / T[Tháng]
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const monthFolder = `T${currentMonth}`; 
    
    // Lấy path dựa trên unit (giữ nguyên hierarchy)
    const unitFolder = getUnitFolderName(user.unit);
    
    // Cấu trúc: Root / Unit Hierarchy / Month / Filename
    const fullPath = `${config.targetFolder}/${unitFolder}/${monthFolder}`;
    
    // --- LOGIC ĐỔI TÊN FILE "CHUYÊN NGHIỆP" ---
    // Format: [Username]_[Tên_Gốc_Sanitized]_[Timestamp].[Ext]
    
    // 1. Tách đuôi file
    const parts = file.name.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    const nameWithoutExt = parts.join('.');
    
    // 2. Xử lý tên gốc: Bỏ dấu tiếng Việt, thay khoảng trắng/ký tự lạ bằng "_"
    const noAccent = nameWithoutExt.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const safeName = noAccent
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .replace(/_+/g, "_"); // Gộp nhiều dấu gạch dưới

    // Giới hạn độ dài tên gốc (50 ký tự) để tránh đường dẫn quá dài
    const shortName = safeName.length > 50 ? safeName.substring(0, 50) : safeName;

    // 3. Tạo timestamp ngắn gọn
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    
    // 4. Ghép chuỗi
    const cleanFileName = `${user.username}_${shortName}_${timeStr}${ext ? '.' + ext : ''}`;

    // === KIỂM TRA DUNG LƯỢNG FILE ===
    const MAX_SIMPLE_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB

    if (file.size < MAX_SIMPLE_UPLOAD_SIZE) {
        // --- CÁCH 1: SIMPLE UPLOAD (Cho file nhỏ) ---
        // SỬ DỤNG XMLHttpRequest ĐỂ CÓ PROGRESS EVENT CHUẨN XÁC
        
        return new Promise((resolve, reject) => {
            const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}/${cleanFileName}:/content`;
            const xhr = new XMLHttpRequest();
            
            xhr.open('PUT', endpoint);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            
            // Hook vào sự kiện progress
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && onProgress) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    onProgress(percent);
                }
            };
            
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        resolve({ success: true, url: data.webUrl });
                    } catch (e) {
                        resolve({ success: true, url: '' }); // Fallback success
                    }
                } else {
                    let errorMessage = xhr.statusText;
                    try {
                        const errBody = JSON.parse(xhr.responseText);
                        if (errBody.error && errBody.error.message) {
                            errorMessage = errBody.error.message;
                        }
                    } catch (e) {}
                    reject(new Error(errorMessage));
                }
            };
            
            xhr.onerror = () => {
                reject(new Error("Lỗi kết nối mạng khi tải ảnh"));
            };
            
            xhr.send(file);
        });

    } else {
        // --- CÁCH 2: RESUMABLE UPLOAD (Cho file lớn - Video) ---
        if (onProgress) onProgress(1); // Start

        // Bước 1: Tạo Upload Session
        const sessionEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}/${cleanFileName}:/createUploadSession`;
        
        const sessionResponse = await fetch(sessionEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    "@microsoft.graph.conflictBehavior": "rename",
                    name: cleanFileName
                }
            })
        });

        if (!sessionResponse.ok) {
            const err = await sessionResponse.json();
            throw new Error(`Không thể khởi tạo upload: ${err.error?.message}`);
        }

        const sessionData = await sessionResponse.json();
        const uploadUrl = sessionData.uploadUrl;

        // Bước 2: Cắt file và gửi từng phần (Chunking)
        // Chunk size: 320 KB * 10 = 3.2 MB
        const CHUNK_SIZE = 327680 * 10; 
        let start = 0;
        let finalResponseData = null;

        while (start < file.size) {
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const slice = file.slice(start, end);
            const rangeHeader = `bytes ${start}-${end - 1}/${file.size}`;

            const chunkResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Length': slice.size.toString(),
                    'Content-Range': rangeHeader
                },
                body: slice
            });

            if (!chunkResponse.ok) {
                throw new Error(`Lỗi upload đoạn ${rangeHeader}`);
            }

            // Tính % tiến trình và gọi callback
            if (onProgress) {
                const percent = Math.round((end / file.size) * 100);
                onProgress(percent);
            }

            if (chunkResponse.status === 201 || chunkResponse.status === 200) {
                finalResponseData = await chunkResponse.json();
            }

            start = end;
        }

        if (finalResponseData) {
             return { success: true, url: finalResponseData.webUrl };
        } else {
             return { success: true, url: 'Upload completed' };
        }
    }

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
 * ADMIN: Đổi tên file/folder trên OneDrive
 */
export const renameOneDriveItem = async (config: AppConfig, itemId: string, newName: string): Promise<{success: boolean, error?: string}> => {
    if (config.simulateMode) return { success: true };

    try {
        const token = await getAccessToken();
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;
        
        // Kiểm tra tên hợp lệ sơ bộ
        if (/[<>:"/\\|?*]/.test(newName)) {
             return { success: false, error: "Tên chứa ký tự không hợp lệ" };
        }

        const body = { name: newName };

        const response = await fetch(endpoint, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
             throw new Error(data.error?.message || "Không thể đổi tên");
        }
        
        return { success: true };
    } catch (error: any) {
        console.error("Rename Error:", error);
        return { success: false, error: error.message };
    }
};

/**
 * HISTORY: Lấy danh sách file kèm thumbnails
 * UPDATE: Lấy từ thư mục chung của Unit và lọc theo prefix tên file (Username)
 */
export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
  if (config.simulateMode) return [];

  try {
    const token = await getAccessToken();
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const monthFolder = `T${currentMonth}`;
    
    // Sử dụng chung logic thư mục Unit (giữ nguyên hierarchy)
    const unitFolder = getUnitFolderName(user.unit);
    
    // Path mới: Root / Unit Hierarchy / Month
    const path = `${config.targetFolder}/${unitFolder}/${monthFolder}`;
    
    // expand=thumbnails để lấy link ảnh thu nhỏ
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children?expand=thumbnails`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error("Lỗi tải lịch sử file");

    const data = await response.json();
    
    // FILTER: Chỉ lấy file bắt đầu bằng username của người dùng hiện tại
    const userPrefix = `${user.username}_`;
    
    const records: PhotoRecord[] = data.value
      .filter((item: any) => item.file && item.name.startsWith(userPrefix))
      .map((item: any) => {
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
    const unitFolder = getUnitFolderName(user.unit); // Sử dụng tên Unit
    const path = `${config.targetFolder}/${unitFolder}`;
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
    const unitFolder = getUnitFolderName(user.unit); // Sử dụng tên Unit
    const path = `${config.targetFolder}/${unitFolder}/${monthName}`;
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
                // UPDATE: Thêm quan_tri_vien vào danh sách chặn
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
