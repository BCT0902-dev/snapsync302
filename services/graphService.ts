
import { AppConfig, User, SystemConfig, PhotoRecord, UploadStatus, CloudItem, SystemStats, QRCodeLog, VisitorRecord } from '../types';
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

// --- QR CODE LOGS ---
export const fetchQRCodeLogs = async (config: AppConfig): Promise<QRCodeLog[]> => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/qrcodes.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    const response = await fetch(endpoint, {
      method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error("Lỗi tải lịch sử QR");
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) { return []; }
};

export const saveQRCodeLog = async (log: QRCodeLog, config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const currentLogs = await fetchQRCodeLogs(config);
    // Kiểm tra trùng lặp cơ bản: cùng fileId và link
    const exists = currentLogs.some(l => l.fileId === log.fileId && l.link === log.link);
    if (exists) return true; // Đã tồn tại log, không cần lưu lại

    const newLogs = [log, ...currentLogs];
    
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/qrcodes.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    
    await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newLogs, null, 2),
    });
    return true;
  } catch (error) { return false; }
};

// --- VISITOR MANAGEMENT ---
// Lưu vào: SnapSync302/Visits/{unit_safe_name}_{yyyy_mm}.json
export const fetchVisitors = async (config: AppConfig, unit: string, monthStr: string): Promise<VisitorRecord[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const safeUnit = unit.replace(/[^a-zA-Z0-9]/g, '_');
        const dbPath = `${config.targetFolder}/Visits/${safeUnit}_${monthStr}.json`;
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
        
        const response = await fetch(endpoint, {
             method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 404) return [];
        if (!response.ok) throw new Error("Lỗi tải danh sách thân nhân");
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
};

export const saveVisitor = async (config: AppConfig, unit: string, visitor: VisitorRecord): Promise<boolean> => {
    if (config.simulateMode) {
        alert("Đang ở chế độ mô phỏng, dữ liệu sẽ không được lưu thật.");
        return true;
    }
    try {
        const today = new Date();
        const monthStr = `${today.getFullYear()}_${(today.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // 1. Fetch current list
        const currentList = await fetchVisitors(config, unit, monthStr);
        
        // 2. Append new record
        const newList = [visitor, ...currentList];
        
        // 3. Save back
        const token = await getAccessToken();
        const safeUnit = unit.replace(/[^a-zA-Z0-9]/g, '_');
        const dbPath = `${config.targetFolder}/Visits/${safeUnit}_${monthStr}.json`;
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(newList, null, 2),
        });
        
        return response.ok;
    } catch (e) {
        console.error("Save visitor failed", e);
        return false;
    }
};

export const updateVisitorStatus = async (config: AppConfig, unit: string, visitorId: string, newStatus: 'approved' | 'completed'): Promise<boolean> => {
    if (config.simulateMode) return true;
    try {
        const today = new Date();
        const monthStr = `${today.getFullYear()}_${(today.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // 1. Fetch current list
        const currentList = await fetchVisitors(config, unit, monthStr);
        
        // 2. Update specific record
        const newList = currentList.map(v => v.id === visitorId ? { ...v, status: newStatus } : v);
        
        // 3. Save back
        const token = await getAccessToken();
        const safeUnit = unit.replace(/[^a-zA-Z0-9]/g, '_');
        const dbPath = `${config.targetFolder}/Visits/${safeUnit}_${monthStr}.json`;
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(newList, null, 2),
        });
        
        return response.ok;
    } catch (e) {
        console.error("Update visitor failed", e);
        return false;
    }
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

/**
 * Fetch direct children of a specific folder ID (Supports Tree View expansion)
 */
export const fetchFolderChildren = async (config: AppConfig, folderId: string): Promise<CloudItem[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?select=id,name,folder,webUrl,lastModifiedDateTime,size&top=200`;
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error("Lỗi tải thư mục con");
        const data = await response.json();
        
        // Chỉ lấy folder, bỏ qua file
        return data.value
            .filter((item: any) => item.folder)
            .map((item: any) => ({
                id: item.id,
                name: item.name,
                folder: item.folder,
                webUrl: item.webUrl,
                lastModifiedDateTime: item.lastModifiedDateTime,
                size: item.size || 0
            } as CloudItem))
            .sort((a: CloudItem, b: CloudItem) => a.name.localeCompare(b.name));

    } catch (error) {
        console.error("Fetch Folder Children Error:", error);
        return [];
    }
};

// --- NEW IMPLEMENTATIONS FOR MISSING EXPORTS ---

export const createShareLink = async (config: AppConfig, itemId: string): Promise<string> => {
  if (config.simulateMode) return "https://onedrive.live.com/redir?mock-link";
  try {
    const token = await getAccessToken();
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'anonymous' })
    });
    if (!response.ok) throw new Error("Create link failed");
    const data = await response.json();
    return data.link.webUrl;
  } catch (error) { throw error; }
};

const mapCloudItemToPhotoRecord = (item: any, status: UploadStatus = UploadStatus.SUCCESS): PhotoRecord => {
  return {
    id: item.id,
    fileName: item.name,
    previewUrl: item.thumbnails?.[0]?.medium?.url || item['@microsoft.graph.downloadUrl'],
    uploadedUrl: item.webUrl,
    status: status,
    timestamp: new Date(item.createdDateTime),
    size: item.size,
    mimeType: item.file?.mimeType,
    deletedDate: item.deleted ? new Date(item.lastModifiedDateTime) : undefined
  };
};

export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const rootPath = config.targetFolder;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}:/search(q='${user.username}')?select=id,name,webUrl,createdDateTime,lastModifiedDateTime,size,file,thumbnails,@microsoft.graph.downloadUrl&expand=thumbnails&top=200`;
    
    const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok) return [];
    
    const data = await response.json();
    const items = data.value || [];
    
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    return items
      .filter((item: any) => 
          item.file && 
          item.name.toLowerCase().startsWith(user.username.toLowerCase()) && 
          new Date(item.createdDateTime) > twoMonthsAgo
      )
      .map((item: any) => mapCloudItemToPhotoRecord(item))
      .sort((a: PhotoRecord, b: PhotoRecord) => b.timestamp.getTime() - a.timestamp.getTime());

  } catch (error) { return []; }
};

export const fetchUserDeletedItems = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/recycleBin`;
        const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) return [];
        const data = await response.json();
        
        return (data.value || [])
            .filter((item: any) => item.name && item.name.toLowerCase().startsWith(user.username.toLowerCase()))
            .map((item: any) => ({
                ...mapCloudItemToPhotoRecord(item, UploadStatus.IDLE),
                deletedDate: new Date(item.lastModifiedDateTime)
            }));
    } catch(e) { return []; }
};

export const listPathContents = async (config: AppConfig, path: string, user?: User): Promise<CloudItem[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const rootPath = config.targetFolder;
        let fullPath = path ? `${rootPath}/${path}` : rootPath;
        fullPath = fullPath.replace(/^\//, '');

        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${fullPath}:/children?select=id,name,folder,file,webUrl,lastModifiedDateTime,size,thumbnails,@microsoft.graph.downloadUrl&expand=thumbnails&top=200`;
        
        const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error("List path failed");
        
        const data = await response.json();
        return (data.value || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            folder: item.folder,
            file: item.file,
            webUrl: item.webUrl,
            lastModifiedDateTime: item.lastModifiedDateTime,
            size: item.size,
            thumbnailUrl: item.thumbnails?.[0]?.medium?.url,
            downloadUrl: item['@microsoft.graph.downloadUrl']
        }));
    } catch (e) { 
        console.error("List Contents Error", e);
        return []; 
    }
};

export const fetchAllMedia = async (config: AppConfig, user: User): Promise<CloudItem[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const rootPath = config.targetFolder;
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${rootPath}:/search(q='')?select=id,name,folder,file,webUrl,lastModifiedDateTime,size,thumbnails,@microsoft.graph.downloadUrl&expand=thumbnails&top=500`;
        
        const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) return [];
        
        const data = await response.json();
        return (data.value || [])
            .filter((item: any) => item.file)
            .map((item: any) => ({
                id: item.id,
                name: item.name,
                folder: item.folder,
                file: item.file,
                webUrl: item.webUrl,
                lastModifiedDateTime: item.lastModifiedDateTime,
                size: item.size,
                thumbnailUrl: item.thumbnails?.[0]?.medium?.url,
                downloadUrl: item['@microsoft.graph.downloadUrl']
            }));
    } catch (e) { return []; }
};

export const aggregateUserStats = (allMedia: CloudItem[], users: User[]): User[] => {
    const statsMap = new Map<string, { count: number, size: number }>();
    users.forEach(u => statsMap.set(u.username.toLowerCase(), { count: 0, size: 0 }));

    allMedia.forEach(item => {
        const parts = item.name.split('_');
        if (parts.length > 0) {
            const username = parts[0].toLowerCase();
            const current = statsMap.get(username);
            if (current) {
                current.count++;
                current.size += item.size;
            }
        }
    });

    return users.map(u => ({
        ...u,
        usageStats: {
            fileCount: statsMap.get(u.username.toLowerCase())?.count || 0,
            totalSize: statsMap.get(u.username.toLowerCase())?.size || 0
        }
    }));
};

export const listUserMonthFolders = async (c: AppConfig, u: User) => [];
export const listFilesInMonthFolder = async (c: AppConfig, u: User, m: string) => [];
