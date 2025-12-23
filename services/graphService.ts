
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
 */
const getUnitFolderName = (unitString: string): string => {
  if (!unitString) return "Unknown_Unit";
  let parts = unitString.split('/').map(p => p.trim());
  if (parts.length > 1 && parts[0].toLowerCase().includes("sư đoàn 302")) {
      parts.shift(); 
  }
  const cleanPath = parts.map(p => p.replace(/[<>:"\\|?*]/g, "_")).join('/');
  return cleanPath;
}

export const getAccessToken = async (): Promise<string> => {
  try {
    const response = await fetch('/api/token');
    if (response.status === 404) throw new Error("API_NOT_FOUND");
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Invalid API Response (Not JSON). Status: ${response.status}. Content: ${text.substring(0, 100)}...`);
    }
    const data = await response.json();
    if (!response.ok || !data.accessToken) throw new Error(data.error || "Không thể lấy Access Token từ server");
    return data.accessToken;
  } catch (error) {
    if ((error as Error).message !== "API_NOT_FOUND") console.error("Token Fetch Error:", error);
    throw error;
  }
};

export const fetchUsersFromOneDrive = async (config: AppConfig): Promise<User[]> => {
  if (config.simulateMode) return INITIAL_USERS;
  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/users.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    const response = await fetch(endpoint, {
      method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 404) return INITIAL_USERS;
    if (!response.ok) throw new Error("Lỗi tải dữ liệu người dùng");
    const cloudUsers = await response.json();
    const userArray = Array.isArray(cloudUsers) ? cloudUsers : [];
    const cloudUsernames = new Set(userArray.map((u: User) => u.username.toLowerCase()));
    const missingDefaults = INITIAL_USERS.filter(u => !cloudUsernames.has(u.username.toLowerCase()));
    return [...userArray, ...missingDefaults];
  } catch (error) { return INITIAL_USERS; }
};

export const saveUsersToOneDrive = async (users: User[], config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/users.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    const content = JSON.stringify(users, null, 2);
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: content,
    });
    return response.ok;
  } catch (error) { return false; }
};

export const fetchSystemConfig = async (config: AppConfig): Promise<SystemConfig> => {
  if (config.simulateMode) return DEFAULT_SYSTEM_CONFIG;
  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/config.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    const response = await fetch(endpoint, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
    if (response.status === 404) return DEFAULT_SYSTEM_CONFIG;
    if (!response.ok) throw new Error("Lỗi tải cấu hình hệ thống");
    const data = await response.json();
    return { ...DEFAULT_SYSTEM_CONFIG, ...data }; 
  } catch (error) { return DEFAULT_SYSTEM_CONFIG; }
};

export const saveSystemConfig = async (sysConfig: SystemConfig, config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/config.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    const content = JSON.stringify(sysConfig, null, 2);
    const response = await fetch(endpoint, {
      method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: content,
    });
    return response.ok;
  } catch (error) { return false; }
};

export const fetchSystemStats = async (config: AppConfig): Promise<Partial<SystemStats>> => {
    if (config.simulateMode) return { totalFiles: 150, totalStorage: 1024 * 1024 * 500 };
    try {
        const token = await getAccessToken();
        const rootPath = config.targetFolder;
        const rootEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}`;
        const rootRes = await fetch(rootEndpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        const rootData = await rootRes.json();
        const totalStorage = rootData.size || 0;
        
        let fileCount = 0;
        let nextLink = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}:/delta?select=id,name,file,deleted`;
        while (nextLink) {
             const res = await fetch(nextLink, { headers: { 'Authorization': `Bearer ${token}` } });
             if (!res.ok) break;
             const data = await res.json();
             if (data.value) {
                 for (const item of data.value) {
                     if (item.file && !item.deleted && item.name !== 'users.json' && item.name !== 'config.json') fileCount++;
                 }
             }
             nextLink = data['@odata.nextLink'];
        }
        return { totalStorage: totalStorage, totalFiles: fileCount };
    } catch (e) { return { totalFiles: 0, totalStorage: 0 }; }
};

export const uploadToOneDrive = async (
    file: File, 
    config: AppConfig, 
    user: User | null, 
    onProgress?: (percent: number) => void,
    destination: 'personal' | 'common' = 'personal'
): Promise<{ success: boolean; url?: string; error?: string; isPending?: boolean }> => {
  if (config.simulateMode) {
    if (onProgress) onProgress(0);
    return new Promise((resolve) => {
      setTimeout(() => { if (onProgress) onProgress(100); resolve({ success: true, url: "https://onedrive.live.com/mock-link/" + file.name }); }, 1500);
    });
  }
  try {
    if (!user) throw new Error("Chưa đăng nhập");
    const token = await getAccessToken();
    const now = new Date();
    
    let fullPath = "";
    let isPending = false;
    
    // Logic xác định đường dẫn dựa trên điểm đến
    if (destination === 'common') {
        if (user.role === 'admin') {
            // Admin upload thẳng vào thư mục chung
            fullPath = `${config.targetFolder}/Tu_lieu_chung`;
        } else {
            // User thường upload vào thư mục chờ duyệt
            fullPath = `${config.targetFolder}/Tu_lieu_chung_Cho_duyet`;
            isPending = true;
        }
    } else {
        // Upload vào thư mục cá nhân (mặc định)
        const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
        const monthFolder = `T${currentMonth}`; 
        const day = now.getDate();
        const weekNum = Math.min(4, Math.ceil(day / 7));
        const weekFolder = `Tuần_${weekNum}`;
        const unitFolder = getUnitFolderName(user.unit);
        fullPath = `${config.targetFolder}/${unitFolder}/${monthFolder}/${weekFolder}`;
    }
    
    const parts = file.name.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    const nameWithoutExt = parts.join('.');
    const noAccent = nameWithoutExt.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const safeName = noAccent.replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9-_]/g, "_").replace(/_+/g, "_");
    const shortName = safeName.length > 50 ? safeName.substring(0, 50) : safeName;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const cleanFileName = `${user.username}_${shortName}_${timeStr}${ext ? '.' + ext : ''}`;

    const MAX_SIMPLE_UPLOAD_SIZE = 4 * 1024 * 1024;
    if (file.size < MAX_SIMPLE_UPLOAD_SIZE) {
        return new Promise((resolve, reject) => {
            const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}/${cleanFileName}:/content`;
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', endpoint);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.upload.onprogress = (event) => { if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100)); };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { const data = JSON.parse(xhr.responseText); resolve({ success: true, url: data.webUrl, isPending }); } catch (e) { resolve({ success: true, url: '', isPending }); }
                } else { reject(new Error(xhr.statusText)); }
            };
            xhr.onerror = () => reject(new Error("Lỗi kết nối mạng"));
            xhr.send(file);
        });
    } else {
        if (onProgress) onProgress(1);
        const sessionEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}/${cleanFileName}:/createUploadSession`;
        const sessionResponse = await fetch(sessionEndpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename", name: cleanFileName } })
        });
        if (!sessionResponse.ok) throw new Error("Cannot create session");
        const sessionData = await sessionResponse.json();
        const uploadUrl = sessionData.uploadUrl;
        const CHUNK_SIZE = 327680 * 10; 
        let start = 0;
        let finalResponseData = null;
        while (start < file.size) {
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const slice = file.slice(start, end);
            const rangeHeader = `bytes ${start}-${end - 1}/${file.size}`;
            const chunkResponse = await fetch(uploadUrl, {
                method: 'PUT', headers: { 'Content-Length': slice.size.toString(), 'Content-Range': rangeHeader }, body: slice
            });
            if (!chunkResponse.ok) throw new Error("Upload chunk failed");
            if (onProgress) onProgress(Math.round((end / file.size) * 100));
            if (chunkResponse.status === 201 || chunkResponse.status === 200) finalResponseData = await chunkResponse.json();
            start = end;
        }
        return { success: true, url: finalResponseData ? finalResponseData.webUrl : 'Upload completed', isPending };
    }
  } catch (error: any) { return { success: false, error: error.message }; }
};

export const deleteFileFromOneDrive = async (config: AppConfig, itemId: string): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const token = await getAccessToken();
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;
    const response = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok && response.status !== 204) throw new Error("Delete failed");
    return true;
  } catch (error) { return false; }
};

export const renameOneDriveItem = async (config: AppConfig, itemId: string, newName: string): Promise<{success: boolean, error?: string}> => {
    if (config.simulateMode) return { success: true };
    try {
        const token = await getAccessToken();
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;
        if (/[<>:"/\\|?*]/.test(newName)) return { success: false, error: "Invalid char" };
        const response = await fetch(endpoint, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        if (!response.ok) throw new Error("Rename failed");
        return { success: true };
    } catch (error: any) { return { success: false, error: error.message }; }
};

export const moveOneDriveItem = async (config: AppConfig, itemId: string, targetFolderName: string): Promise<boolean> => {
    if (config.simulateMode) return true;
    try {
        const token = await getAccessToken();
        const rootPath = config.targetFolder;
        const targetPath = `${rootPath}/${targetFolderName}`;
        const targetFolderRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${targetPath}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!targetFolderRes.ok) throw new Error("Target folder not found");
        const targetFolderData = await targetFolderRes.json();
        const targetFolderId = targetFolderData.id;

        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;
        const response = await fetch(endpoint, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                parentReference: { id: targetFolderId }
            })
        });

        if (!response.ok) throw new Error("Move failed");
        return true;
    } catch (e) {
        console.error("Move Item Error", e);
        return false;
    }
};

// --- START NEW LOGIC FOR HISTORY AND PERMISSIONS ---

/**
 * HISTORY UPDATE (Fix 2): 
 * Sử dụng API Direct Children Listing thay vì Search API.
 * API Search có độ trễ (latency) khi index file mới (vài phút), 
 * trong khi Children Listing là tức thì.
 */
export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
  if (config.simulateMode) return [];

  try {
    const token = await getAccessToken();
    const now = new Date();
    
    // 1. Xác định các đường dẫn chính xác nơi file vừa được upload
    // Thay vì quét tất cả, ta quét chính xác thư mục TUẦN HIỆN TẠI và Tư liệu chung
    const pathsToCheck: string[] = [];

    // Path A: Personal Folder (Tuần hiện tại & Tuần trước để đảm bảo)
    const currentMonthNum = now.getMonth() + 1;
    const monthStr = `T${currentMonthNum.toString().padStart(2, '0')}`;
    const day = now.getDate();
    const currentWeekNum = Math.min(4, Math.ceil(day / 7));
    const weekStr = `Tuần_${currentWeekNum}`;
    
    const unitFolder = getUnitFolderName(user.unit);
    
    // Scan Tuần hiện tại
    pathsToCheck.push(`${config.targetFolder}/${unitFolder}/${monthStr}/${weekStr}`);
    
    // Scan thư mục "Tư liệu chung"
    pathsToCheck.push(`${config.targetFolder}/Tu_lieu_chung`);

    // Scan thư mục "Chờ duyệt" (nếu có)
    pathsToCheck.push(`${config.targetFolder}/Tu_lieu_chung_Cho_duyet`);
    
    // Hàm fetch children trực tiếp (Nhanh và Realtime)
    const fetchChildrenFromPath = async (searchPath: string): Promise<any[]> => {
        // Sử dụng endpoint children thay vì search
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${searchPath}:/children?select=id,name,webUrl,createdDateTime,size,file,parentReference&expand=thumbnails&top=200`;
        
        try {
            const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 404) return []; // Thư mục chưa được tạo
            if (!res.ok) return []; 
            const data = await res.json();
            return data.value || [];
        } catch { return []; }
    };

    // Chạy song song
    const results = await Promise.all(pathsToCheck.map(p => fetchChildrenFromPath(p)));
    const allFiles = results.flat();

    const userPrefix = `${user.username}_`;
    
    const records: PhotoRecord[] = allFiles
      .filter((item: any) => item.file && item.name.startsWith(userPrefix))
      .map((item: any) => {
        let thumbnailUrl = '';
        if (item.thumbnails && item.thumbnails.length > 0) {
          thumbnailUrl = item.thumbnails[0].medium?.url || item.thumbnails[0].large?.url || item.thumbnails[0].small?.url || '';
        }

        // Xác định trạng thái dựa trên thư mục cha
        let status = UploadStatus.SUCCESS;
        let errorMsg = undefined;
        // Kiểm tra đơn giản: nếu trong thư mục cha có tên "Cho_duyet"
        if (item.parentReference?.path?.includes('Cho_duyet')) {
            errorMsg = "Chờ duyệt";
        }

        return {
          id: item.id,
          fileName: item.name,
          status: status,
          errorMessage: errorMsg,
          uploadedUrl: item.webUrl,
          timestamp: new Date(item.createdDateTime),
          size: item.size,
          previewUrl: thumbnailUrl,
          mimeType: item.file?.mimeType,
          views: 0,
          downloads: 0
        };
      });

    // Sort mới nhất lên đầu
    return records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  } catch (error) {
    console.error("Fetch Recent Files Error:", error);
    return [];
  }
};

export const fetchUserDeletedItems = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/recycleBin`;
        const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) return [];
        const data = await response.json();
        const userPrefix = `${user.username}_`;
        const records: PhotoRecord[] = data.value
            .filter((item: any) => item.name.startsWith(userPrefix)) 
            .map((item: any) => ({
                id: item.id,
                fileName: item.name,
                status: UploadStatus.ERROR, 
                timestamp: new Date(item.lastModifiedDateTime),
                deletedDate: new Date(item.deleted?.deletedDateTime || new Date()),
                size: item.size,
                mimeType: 'deleted',
                uploadedUrl: ''
            }));
        return records;
    } catch (e) {
        return [];
    }
};

/**
 * GALLERY UPDATE (Fix 1): Ẩn thư mục lạ
 */
export const listPathContents = async (config: AppConfig, relativePath: string = "", user?: User): Promise<CloudItem[]> => {
  if (config.simulateMode) {
    if (relativePath === "") return [{ id: '1', name: 'Sư đoàn 302', folder: {childCount: 1}, webUrl: '#', lastModifiedDateTime: new Date().toISOString(), size: 0 }];
    return [];
  }

  try {
    const token = await getAccessToken();
    let path = config.targetFolder;
    if (relativePath) {
      path += `/${relativePath}`;
    }

    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/children?expand=thumbnails`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error("Lỗi tải dữ liệu thư mục");

    const data = await response.json();
    
    let items = data.value.map((item: any) => {
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
         downloadUrl: item['@microsoft.graph.downloadUrl'],
         views: 0,
         downloads: 0
       } as CloudItem;
    });

    // --- PERMISSION LOGIC ---
    if (user && user.role !== 'admin') {
        const SYSTEM_HIDDEN = ['system', 'bo_chi_huy'];
        items = items.filter((i: CloudItem) => !SYSTEM_HIDDEN.includes(i.name.toLowerCase()));

        if (relativePath === "") {
            // ROOT LEVEL RESTRICTION
            // Chỉ hiển thị 2 loại folder:
            // 1. "Tu_lieu_chung"
            // 2. Folder đúng với Đơn vị của User
            // Tất cả folder khác (do Admin tạo) đều bị ẩn.
            
            const userUnitFolderName = getUnitFolderName(user.unit).split('/').pop()?.toLowerCase(); // Lấy tên folder cuối (VD: Phong_Tham_muu)

            items = items.filter((i: CloudItem) => {
                const name = i.name.toLowerCase();
                
                // Luôn hiện Tư liệu chung
                if (name === 'tu_lieu_chung') return true;
                
                // Ẩn folder Chờ duyệt
                if (name === 'tu_lieu_chung_cho_duyet') return false;
                
                // Ẩn folder Admin system
                if (name === 'quan_tri_vien') return false;

                // Kiểm tra xem Folder này có phải là Folder đơn vị của User không?
                // Logic cũ: user.unit.includes(i.name) -> Dễ bị sai nếu tên folder admin tạo gần giống
                // Logic mới: So sánh chính xác tên folder đã được chuẩn hóa
                if (name === userUnitFolderName) return true;

                // Nếu không thuộc các trường hợp trên -> ẨN (Đây là folder admin tạo thêm)
                return false; 
            });
        }
    }

    return items;

  } catch (error) {
    console.error("Gallery Fetch Error:", error);
    return [];
  }
};

export const createShareLink = async (config: AppConfig, itemId: string) => {
  if (config.simulateMode) return "https://mock-share-link.com";
  try {
    const token = await getAccessToken();
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
  } catch (error) { throw error; }
};

export const fetchAllMedia = async (config: AppConfig, user: User): Promise<CloudItem[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const rootPath = config.targetFolder;
        const rootEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}`;
        const rootRes = await fetch(rootEndpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!rootRes.ok) throw new Error("Root not found");
        const rootData = await rootRes.json();
        const results: CloudItem[] = [];
        await crawlFolderRecursive(token, rootData.id, results, user);
        return results;
    } catch (error) { return []; }
};

const crawlFolderRecursive = async (token: string, folderId: string, results: CloudItem[], user: User) => {
  try {
    let nextLink = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?expand=thumbnails&top=200`;
    while (nextLink) {
      const response = await fetch(nextLink, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) break;
      const data = await response.json();
      if (data.value) {
        for (const item of data.value) {
            if (user.role !== 'admin') {
                const name = item.name.toLowerCase();
                // Admin folders: System, Bo_chi_huy, Quan_tri_vien
                if (name === 'system' || name === 'bo_chi_huy' || name === 'quan_tri_vien') continue;
                // Hide Pending Folder
                if (name === 'tu_lieu_chung_cho_duyet') continue;
            }
            if (item.folder) { await crawlFolderRecursive(token, item.id, results, user); } 
            else if (item.file) {
                const name = item.name.toLowerCase();
                if (name === 'users.json' || name === 'config.json') continue;
                const mime = item.file.mimeType || '';
                if (mime.startsWith('image/') || mime.startsWith('video/') || /\.(jpg|jpeg|png|mp4|mov)$/i.test(name)) {
                    let thumb = "";
                    if (item.thumbnails?.length > 0) thumb = item.thumbnails[0].medium?.url || "";
                    results.push({
                        id: item.id, name: item.name, file: item.file, webUrl: item.webUrl,
                        lastModifiedDateTime: item.lastModifiedDateTime, size: item.size, thumbnailUrl: thumb,
                        downloadUrl: item['@microsoft.graph.downloadUrl'],
                        views: Math.floor(Math.random() * 100), downloads: Math.floor(Math.random() * 50)
                    });
                }
            }
        }
      }
      nextLink = data['@odata.nextLink'];
    }
  } catch (e) { }
}

export const aggregateUserStats = (allMedia: CloudItem[], users: User[]): User[] => {
    const statsMap = new Map<string, { count: number, size: number }>();
    users.forEach(u => { statsMap.set(u.username.toLowerCase(), { count: 0, size: 0 }); });
    allMedia.forEach(item => {
        if (!item.file) return;
        const fileName = item.name.toLowerCase();
        for (const u of users) {
             const prefix = u.username.toLowerCase() + '_';
             if (fileName.startsWith(prefix)) {
                 const current = statsMap.get(u.username.toLowerCase())!;
                 current.count++;
                 current.size += item.size;
                 break;
             }
        }
    });
    return users.map(u => ({
        ...u,
        usageStats: { fileCount: statsMap.get(u.username.toLowerCase())?.count || 0, totalSize: statsMap.get(u.username.toLowerCase())?.size || 0 }
    }));
};

export const listUserMonthFolders = async (c: AppConfig, u: User) => [];
export const listFilesInMonthFolder = async (c: AppConfig, u: User, m: string) => [];
