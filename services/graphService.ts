// BCT0902
import { AppConfig, User, SystemConfig, CloudItem, PhotoRecord, UploadStatus, SystemStats, QRCodeLog, VisitorRecord } from '../types';
import { INITIAL_USERS } from './mockAuth';

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  appName: 'CNTT/f302',
  logoUrl: '',
  themeColor: '#059669'
};

export const getAccessToken = async (): Promise<string> => {
  try {
    const response = await fetch('/api/token');
    if (response.ok) {
      const data = await response.json();
      return data.accessToken;
    }
    throw new Error("No token");
  } catch (e) {
    throw new Error("API_NOT_FOUND");
  }
};

const getHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
});

// --- HELPER: TÍNH TOÁN THƯ MỤC TUẦN ---
// Logic: T{Tháng}/Tuần_{Tuần trong tháng}
const getCurrentWeekFolder = () => {
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    // Tính tuần: Ngày chia 7 làm tròn lên (tối đa tuần 4 hoặc 5)
    const week = Math.min(5, Math.ceil(now.getDate() / 7)); 
    return `T${month}/Tuần_${week}`;
};

// --- HELPER: LẤY TÊN ĐƠN VỊ CẤP CUỐI (LEAF UNIT) ---
// VD: "Trung đoàn 88/Đại đội 18" -> "Đại đội 18"
const getLeafUnitName = (unit: string): string => {
    if (!unit) return "Unknown";
    const parts = unit.split('/');
    return parts[parts.length - 1].trim();
};

// --- USER MANAGEMENT ---

export const fetchUsersFromOneDrive = async (config: AppConfig): Promise<User[]> => {
  if (config.simulateMode) return INITIAL_USERS;
  
  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/users.json:/content`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) {
      return await res.json();
    }
    return INITIAL_USERS;
  } catch (e) {
    console.error("Fetch users failed", e);
    return INITIAL_USERS;
  }
};

export const saveUsersToOneDrive = async (users: User[], config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;

  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/users.json:/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(users, null, 2)
    });
    return res.ok;
  } catch (e) {
    console.error("Save users failed", e);
    return false;
  }
};

// --- SYSTEM CONFIG ---

export const fetchSystemConfig = async (config: AppConfig): Promise<SystemConfig> => {
  if (config.simulateMode) return DEFAULT_SYSTEM_CONFIG;
  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/config.json:/content`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) return await res.json();
    return DEFAULT_SYSTEM_CONFIG;
  } catch (e) {
    return DEFAULT_SYSTEM_CONFIG;
  }
};

export const saveSystemConfig = async (sysConfig: SystemConfig, config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/config.json:/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(sysConfig, null, 2)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
};

// --- FILE OPERATIONS ---

// Hàm map dữ liệu từ Graph API sang CloudItem
const mapGraphItemToCloudItem = (i: any): CloudItem => ({
    id: i.id,
    name: i.name,
    folder: i.folder,
    file: i.file, // Giữ nguyên object file để lấy mimeType
    webUrl: i.webUrl,
    lastModifiedDateTime: i.lastModifiedDateTime,
    size: i.size,
    // QUAN TRỌNG: Lấy link download trực tiếp (pre-signed)
    downloadUrl: i['@microsoft.graph.downloadUrl'], 
    // Ưu tiên ảnh thumbnail medium cho load nhanh (Public URL), fallback về downloadUrl
    thumbnailUrl: i.thumbnails?.[0]?.medium?.url || i['@microsoft.graph.downloadUrl'],
    mediumUrl: i.thumbnails?.[0]?.medium?.url,
    largeUrl: i.thumbnails?.[0]?.large?.url || i['@microsoft.graph.downloadUrl']
});

export const listPathContents = async (config: AppConfig, path: string, user?: User): Promise<CloudItem[]> => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
    const target = cleanPath ? 
      `:/${config.targetFolder}/${cleanPath}:/children` : 
      `:/${config.targetFolder}:/children`;
    
    // Select các trường cần thiết để tối ưu tốc độ và lấy đúng link ảnh
    const url = `https://graph.microsoft.com/v1.0/me/drive/root${target}?$expand=thumbnails($select=medium,large)&$select=id,name,folder,file,webUrl,lastModifiedDateTime,size,video,image,parentReference,@microsoft.graph.downloadUrl`;
    
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return [];
    
    const data = await res.json();
    let items = data.value as any[];
    
    // --- PHÂN QUYỀN HIỂN THỊ (SỬA LẠI THEO YÊU CẦU MỚI) ---
    // Logic: Nếu là user thường và đang ở thư mục gốc (path rỗng)
    if (user && user.role !== 'admin' && !cleanPath) {
        const allowedNames = new Set<string>();
        
        // 1. Thư mục Đơn vị: Dùng tên cấp cuối cùng (Leaf Unit)
        // Ví dụ: User c18_f302 (Trung đoàn 88/Đại đội 18) -> Folder tên là "Đại đội 18"
        const leafUnit = getLeafUnitName(user.unit).toLowerCase();
        allowedNames.add(leafUnit); 
        
        // 2. Thư mục chung
        allowedNames.add('tu_lieu_chung');
        
        // 3. Các thư mục được Admin cấp quyền riêng (nếu có)
        if (user.allowedPaths && Array.isArray(user.allowedPaths)) {
            user.allowedPaths.forEach(p => allowedNames.add(p.toLowerCase()));
        }

        // Thực hiện lọc: So sánh tên folder
        items = items.filter(item => {
            const itemName = item.name.toLowerCase();
            return allowedNames.has(itemName);
        });
    }

    return items.map(mapGraphItemToCloudItem);
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const fetchFolderChildren = async (config: AppConfig, folderId: string): Promise<CloudItem[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$expand=thumbnails($select=medium,large)&$select=id,name,folder,file,webUrl,lastModifiedDateTime,size,@microsoft.graph.downloadUrl`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return [];
        const data = await res.json();
        return data.value.map(mapGraphItemToCloudItem);
    } catch(e) { return []; }
};

export const uploadToOneDrive = async (file: File, config: AppConfig, user: User, onProgress: (p: number) => void, destination: string): Promise<{success: boolean, url?: string, error?: string, isPending?: boolean}> => {
  if (config.simulateMode) {
      onProgress(100);
      return { success: true, url: 'http://mock.url', isPending: destination === 'common' };
  }
  
  try {
    const token = await getAccessToken();
    let folderPath = '';

    if (destination === 'personal') {
        // --- LOGIC PATH MỚI: Dùng Leaf Unit Name ---
        // Ví dụ: SnapSync302/Đại đội 18/T09/Tuần_1
        const leafUnit = getLeafUnitName(user.unit);
        const timePath = getCurrentWeekFolder();
        folderPath = `${config.targetFolder}/${leafUnit}/${timePath}`;
    } else {
        // Tư liệu chung chờ duyệt: Vẫn giữ username để biết ai gửi để admin duyệt
        folderPath = `${config.targetFolder}/Tu_lieu_chung_Cho_duyet/${user.username}`;
    }
        
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${folderPath}/${file.name}:/content`;
    
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type },
        body: file
    });

    if (res.ok) {
        onProgress(100);
        const data = await res.json();
        return { success: true, url: data.webUrl, isPending: destination === 'common' };
    } else {
        return { success: false, error: res.statusText };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteFileFromOneDrive = async (config: AppConfig, itemId: string): Promise<boolean> => {
    if (config.simulateMode) return true;
    try {
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;
        const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        return res.ok;
    } catch (e) { return false; }
};

export const renameOneDriveItem = async (config: AppConfig, itemId: string, newName: string): Promise<{success: boolean, error?: string}> => {
    if (config.simulateMode) return { success: true };
    try {
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;
        const res = await fetch(url, {
            method: 'PATCH',
            headers: getHeaders(token),
            body: JSON.stringify({ name: newName })
        });
        if (res.ok) return { success: true };
        const data = await res.json();
        return { success: false, error: data.error?.message };
    } catch (e: any) { return { success: false, error: e.message }; }
};

export const moveOneDriveItem = async (config: AppConfig, itemId: string, destFolderName: string): Promise<boolean> => {
     if (config.simulateMode) return true;
     
     try {
         const token = await getAccessToken();

         // 1. Lấy ID của thư mục đích (VD: Tu_lieu_chung)
         const destPathUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${destFolderName}?select=id,name`;
         const destRes = await fetch(destPathUrl, { headers: { 'Authorization': `Bearer ${token}` } });
         
         if (!destRes.ok) {
             console.error("Destination folder not found:", destFolderName);
             return false;
         }
         
         const destData = await destRes.json();
         const targetFolderId = destData.id;

         // 2. Thực hiện lệnh MOVE (PATCH parentReference)
         const moveUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`;
         
         const moveBody = {
             parentReference: {
                 id: targetFolderId
             },
             name: undefined 
         };

         const moveRes = await fetch(moveUrl, {
             method: 'PATCH',
             headers: getHeaders(token),
             body: JSON.stringify(moveBody)
         });

         if (moveRes.ok || moveRes.status === 202) {
             return true;
         }
         
         const err = await moveRes.json();
         console.error("Move failed details:", err);
         return false;

     } catch (e) {
         console.error("Move Exception:", e);
         return false;
     }
};

export const createShareLink = async (config: AppConfig, itemId: string): Promise<string> => {
    if (config.simulateMode) return "http://mock.share.link";
    try {
        const token = await getAccessToken();

        // BƯỚC 1: KIỂM TRA LINK CŨ TRƯỚC (Tránh lỗi tạo trùng)
        try {
            const permUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/permissions`;
            const permRes = await fetch(permUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            if (permRes.ok) {
                const permData = await permRes.json();
                
                // Tìm permission loại anonymous (công khai), type view, VÀ chưa hết hạn
                const existing = permData.value?.find((p: any) => {
                    const isAnonymous = p.link && p.link.scope === 'anonymous' && p.link.type === 'view';
                    if (!isAnonymous) return false;
                    
                    // Check expiration if present
                    if (p.expirationDateTime) {
                        const expiry = new Date(p.expirationDateTime);
                        if (expiry < new Date()) return false; // Link đã hết hạn
                    }
                    return true;
                });

                if (existing) {
                    return existing.link.webUrl;
                }
            }
        } catch (ignored) {
            console.warn("Could not check existing permissions, trying creation anyway.");
        }

        // BƯỚC 2: TẠO MỚI NẾU CHƯA CÓ
        const url = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`;
        let body = { type: 'view', scope: 'anonymous' };
        let res = await fetch(url, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify(body)
        });
        
        if (!res.ok) {
             const errorData = await res.json().catch(() => ({}));
             // Nếu lỗi nhưng thông báo là link đã tồn tại (dù bước 1 check miss), thử lấy lại permission lần nữa
             throw new Error(errorData.error?.message || "Tổ chức không cho phép chia sẻ công khai (Anonymous).");
        }
        const data = await res.json();
        return data.link.webUrl;
    } catch (e: any) { 
        throw e; 
    }
};

// --- CORE RECURSIVE CRAWLER (Used for Admin View All) ---
const crawlFolder = async (token: string, folderUrl: string, selectFields: string, maxDepth: number = 5, currentDepth: number = 0): Promise<any[]> => {
    if (currentDepth > maxDepth) return [];
    let items: any[] = [];
    let nextLink = folderUrl;
    try {
        while (nextLink) {
            const res = await fetch(nextLink, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) break;
            const data = await res.json();
            items.push(...(data.value || []));
            nextLink = data['@odata.nextLink'];
        }
    } catch (e) { return []; }

    let allFiles: any[] = items.filter((i: any) => i.file);
    const subFolders = items.filter((i: any) => i.folder);

    const subTasks = subFolders.map(folder => {
        const childUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${folder.id}/children?${selectFields}`;
        return crawlFolder(token, childUrl, selectFields, maxDepth, currentDepth + 1);
    });

    const subResults = await Promise.all(subTasks);
    subResults.forEach(res => {
        allFiles = allFiles.concat(res);
    });
    return allFiles;
};

// --- HISTORY & STATS ---

export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
    if (config.simulateMode) return [];
    
    try {
        const token = await getAccessToken();
        const selectFields = "select=id,name,file,webUrl,lastModifiedDateTime,size,parentReference,thumbnails,@microsoft.graph.downloadUrl";

        let allFiles: any[] = [];

        // ADMIN: Vẫn dùng Search cho nhanh (Root context) hoặc Crawl nếu Search lỗi. 
        // Để đảm bảo nhất, ta dùng Crawl luôn nếu Search không tin cậy, nhưng với Admin Search thường OK.
        // Tuy nhiên để đồng nhất, ta dùng Crawl targeted cho Admin cũng được, nhưng Admin cần xem ALL.
        if (user.role === 'admin') {
             const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}:/search(q=' ')?${selectFields}&top=200`;
             const res = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } });
             if (res.ok) {
                 const data = await res.json();
                 allFiles = data.value || [];
             }
        } else {
             // USER: CRAWL DIRECTLY (Fix lỗi không hiện History)
             // Quét 2 nơi: Thư mục Đơn vị và Thư mục Chờ duyệt của họ
             const leafUnit = getLeafUnitName(user.unit);
             const urlsToCrawl = [
                 `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${leafUnit}:/children?${selectFields}`,
                 `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Tu_lieu_chung_Cho_duyet/${user.username}:/children?${selectFields}`,
                 `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Tu_lieu_chung:/children?${selectFields}` // Thêm Common nếu muốn hiện trong history
             ];

             const promises = urlsToCrawl.map(u => crawlFolder(token, u, selectFields));
             const results = await Promise.all(promises);
             allFiles = results.flat();
        }

        // Deduplicate & Filter
        const uniqueMap = new Map();
        allFiles.forEach(i => {
             if(i.file) uniqueMap.set(i.id, i);
        });

        const items = Array.from(uniqueMap.values());

        return items
            .sort((a: any, b: any) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime())
            .slice(0, 50)
            .map((i: any) => ({
                id: i.id,
                fileName: i.name,
                file: undefined,
                previewUrl: i.thumbnails?.[0]?.medium?.url || i['@microsoft.graph.downloadUrl'], 
                uploadedUrl: i.webUrl,
                status: UploadStatus.SUCCESS,
                timestamp: new Date(i.lastModifiedDateTime),
                size: i.size,
                mimeType: i.file?.mimeType,
                // Check if file is in "Cho_duyet" folder based on path
                errorMessage: (i.parentReference?.path || "").includes("Cho_duyet") ? "Chờ duyệt" : undefined
            }));

    } catch (e) {
        console.error("Error fetching recent files:", e);
        return [];
    }
};

export const fetchUserDeletedItems = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/root/recycleBin`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return [];
        const data = await res.json();
        const items = data.value || [];
        return items.map((i: any) => ({
            id: i.id,
            fileName: i.name,
            file: undefined,
            previewUrl: '', 
            status: UploadStatus.SUCCESS,
            timestamp: new Date(i.lastModifiedDateTime),
            deletedDate: i.deleted?.time ? new Date(i.deleted.time) : new Date(),
            size: i.size
        }));
    } catch (e) { return []; }
};

export const fetchAllMedia = async (config: AppConfig, user: User): Promise<CloudItem[]> => {
     if (config.simulateMode) return [];
     const selectFields = "$expand=thumbnails($select=medium,large)&$select=id,name,folder,file,webUrl,lastModifiedDateTime,size,parentReference,@microsoft.graph.downloadUrl";
     try {
         const token = await getAccessToken();
         
         if (user.role === 'admin') {
             // ADMIN: CRAWL ROOT
             const rootUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}:/children?${selectFields}`;
             const allRawItems = await crawlFolder(token, rootUrl, selectFields);
             const uniqueMap = new Map();
             allRawItems.forEach(i => {
                 if (!['users.json', 'config.json', 'qrcodes.json'].includes(i.name.toLowerCase())) {
                     uniqueMap.set(i.id, i);
                 }
             });
             return Array.from(uniqueMap.values()).map(mapGraphItemToCloudItem);
         } else {
             // USER: CRAWL TARGETED FOLDERS (Fix lỗi View All trống)
             const leafUnit = getLeafUnitName(user.unit);
             
             // Danh sách các folder user được phép xem
             const urlsToCrawl = [
                 `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${leafUnit}:/children?${selectFields}`,
                 `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Tu_lieu_chung:/children?${selectFields}`,
                 `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Tu_lieu_chung_Cho_duyet/${user.username}:/children?${selectFields}`
             ];

             // Thêm các folder được cấp quyền riêng (nếu có)
             if (user.allowedPaths && Array.isArray(user.allowedPaths)) {
                 user.allowedPaths.forEach(path => {
                     urlsToCrawl.push(`https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${path}:/children?${selectFields}`);
                 });
             }

             const promises = urlsToCrawl.map(u => crawlFolder(token, u, selectFields));
             const results = await Promise.all(promises);
             const combined = results.flat();

             // Deduplicate
             const uniqueMap = new Map();
             combined.forEach(i => {
                 // Chỉ lấy file, và loại bỏ các file cấu hình hệ thống nếu lỡ lọt vào
                 if (i.file && !['users.json', 'config.json', 'qrcodes.json'].includes(i.name.toLowerCase())) {
                     uniqueMap.set(i.id, i);
                 }
             });
             
             return Array.from(uniqueMap.values()).map(mapGraphItemToCloudItem);
         }
     } catch (e) { return []; }
};

export const fetchSystemStats = async (config: AppConfig): Promise<SystemStats> => {
    if (config.simulateMode) return { totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 };
    try {
        const token = await getAccessToken();
        
        // 1. Get Storage Usage (Direct call to root)
        const folderInfoUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}?select=size`;
        const folderRes = await fetch(folderInfoUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        let totalStorage = 0;
        if (folderRes.ok) {
            const folderData = await folderRes.json();
            totalStorage = folderData.size || 0;
        }

        // 2. Count Files (Handle Pagination for accuracy > 999 files)
        let totalFiles = 0;
        let searchUrl: string | null = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}:/search(q=' ')?select=id,file&top=999`;
        
        while (searchUrl) {
            // Fix TS7022: Explicit type annotations
            const res: Response = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) break;
            
            const data: any = await res.json();
            
            // Count items that are files
            if (data.value) {
                totalFiles += data.value.filter((i: any) => i.file).length;
            }
            
            // Check for next page link
            searchUrl = data['@odata.nextLink'] || null;
        }

        return { totalUsers: 0, activeUsers: 0, totalFiles, totalStorage };
    } catch (e) {
        return { totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 };
    }
};

export const aggregateUserStats = (media: CloudItem[], users: User[]): User[] => {
    return users.map(u => {
        const userFiles = media.filter(m => m.name.includes(u.username) || (u.username === 'admin')); 
        const totalSize = userFiles.reduce((acc, curr) => acc + curr.size, 0);
        return {
            ...u,
            usageStats: { fileCount: userFiles.length, totalSize: totalSize }
        };
    });
};

// --- QR LOGS & VISITORS ---
export const fetchQRCodeLogs = async (config: AppConfig): Promise<QRCodeLog[]> => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/qrcodes.json:/content`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) return await res.json();
    return [];
  } catch (e) { return []; }
};

export const saveQRCodeLog = async (log: QRCodeLog, config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const logs = await fetchQRCodeLogs(config);
    logs.push(log);
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/qrcodes.json:/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(logs, null, 2)
    });
    return res.ok;
  } catch (error) { return false; }
};

export const deleteQRCodeLog = async (config: AppConfig, logId: string): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const currentLogs = await fetchQRCodeLogs(config);
    const newLogs = currentLogs.filter(l => l.id !== logId);
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/qrcodes.json:/content`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(newLogs, null, 2)
    });
    return response.ok;
  } catch (error) { return false; }
};

export const fetchVisitors = async (config: AppConfig, unit: string, monthStr: string): Promise<VisitorRecord[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Visits/${unit}_${monthStr}.json:/content`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) return await res.json();
        return [];
    } catch(e) { return []; }
};

export const saveVisitor = async (config: AppConfig, unitCode: string, record: VisitorRecord): Promise<boolean> => {
    if (config.simulateMode) return true;
    try {
        const date = new Date(record.visitDate);
        const monthStr = `${date.getFullYear()}_${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const currentVisitors = await fetchVisitors(config, unitCode, monthStr);
        currentVisitors.push(record);
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Visits/${unitCode}_${monthStr}.json:/content`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: getHeaders(token),
            body: JSON.stringify(currentVisitors, null, 2)
        });
        return res.ok;
    } catch(e) { return false; }
};

export const updateVisitorStatus = async (config: AppConfig, unitCode: string, recordId: string, status: 'pending' | 'approved' | 'completed'): Promise<boolean> => {
     if (config.simulateMode) return true;
     try {
        const date = new Date(); 
        const monthStr = `${date.getFullYear()}_${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const currentVisitors = await fetchVisitors(config, unitCode, monthStr);
        const updatedVisitors = currentVisitors.map(v => v.id === recordId ? { ...v, status } : v);
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Visits/${unitCode}_${monthStr}.json:/content`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: getHeaders(token),
            body: JSON.stringify(updatedVisitors, null, 2)
        });
        return res.ok;
     } catch(e) { return false; }
};