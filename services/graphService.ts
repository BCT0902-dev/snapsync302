
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
    const url = `https://graph.microsoft.com/v1.0/me/drive/root${target}?$expand=thumbnails($select=medium,large)&$select=id,name,folder,file,webUrl,lastModifiedDateTime,size,video,image,@microsoft.graph.downloadUrl`;
    
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return [];
    
    const data = await res.json();
    let items = data.value as any[];
    
    // --- PHÂN QUYỀN HIỂN THỊ ---
    // Chỉ áp dụng khi user không phải admin VÀ đang xem thư mục gốc (path rỗng)
    if (user && user.role !== 'admin' && !cleanPath) {
        const allowedNames = new Set<string>();
        
        // 1. Thư mục cá nhân: Tên trùng với username (theo logic upload)
        // Lưu ý: Graph API không phân biệt hoa thường trong path, nhưng khi filter list items thì cần chính xác
        // Nên ta sẽ so sánh toLowerCase()
        allowedNames.add(user.username.toLowerCase());
        
        // 2. Thư mục chung
        allowedNames.add('tu_lieu_chung');
        
        // 3. Các thư mục được Admin cấp quyền
        if (user.allowedPaths && Array.isArray(user.allowedPaths)) {
            user.allowedPaths.forEach(p => allowedNames.add(p.toLowerCase()));
        }

        // Thực hiện lọc
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
        // Cấu trúc: .../Username/T{Tháng}/Tuần_{Tuần}
        const timePath = getCurrentWeekFolder();
        folderPath = `${config.targetFolder}/${user.username}/${timePath}`;
    } else {
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
         const destPathUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${destFolderName}?select=id`;
         const destRes = await fetch(destPathUrl, { headers: { 'Authorization': `Bearer ${token}` } });
         
         if (!destRes.ok) {
             console.error("Destination folder not found");
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
             // Có thể đổi tên file nếu cần thiết để tránh trùng lặp, nhưng Graph API sẽ tự xử lý hoặc báo lỗi
             // name: "new_name.jpg" 
         };

         const moveRes = await fetch(moveUrl, {
             method: 'PATCH',
             headers: getHeaders(token),
             body: JSON.stringify(moveBody)
         });

         if (moveRes.ok) return true;
         
         const err = await moveRes.json();
         console.error("Move failed:", err);
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
        const url = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`;
        
        // 1. Cố gắng tạo link 'anonymous' (Ai cũng xem được, không cần đăng nhập)
        let body = { type: 'view', scope: 'anonymous' };
        
        let res = await fetch(url, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify(body)
        });

        // 2. Nếu thất bại (Lỗi 400/403 - Do chính sách công ty chặn Anonymous)
        if (!res.ok) {
             const errorData = await res.json();
             console.warn("Anonymous link failed", errorData);
             
             // Thử lại với scope organization (Chỉ nội bộ xem được)
             // Hoặc throw error để UI báo người dùng biết
             throw new Error("Tổ chức không cho phép chia sẻ công khai (Anonymous). Chỉ có thể chia sẻ nội bộ.");
        }

        const data = await res.json();
        return data.link.webUrl;
    } catch (e: any) { 
        throw e; 
    }
};

// --- CORE RECURSIVE CRAWLER ---
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
    } catch (e) {
        return [];
    }

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
        
        // --- TARGETED CRAWL (QUÉT CỤ THỂ) ---
        // Chỉ quét vào thư mục của Tháng Hiện Tại của User
        // Cấu trúc: username/T{month}/Tuần_{week}
        
        const now = new Date();
        const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
        
        // Path tới folder tháng hiện tại của User
        const currentMonthPath = `${config.targetFolder}/${user.username}/T${monthStr}`;
        const selectFields = "$expand=thumbnails($select=medium,large)&$select=id,name,file,webUrl,lastModifiedDateTime,size,@microsoft.graph.downloadUrl";
        
        const monthUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${currentMonthPath}:/children?${selectFields}`;
        
        // Crawl nhẹ (độ sâu 2: Tháng -> Tuần -> File)
        const recentFiles = await crawlFolder(token, monthUrl, selectFields, 2);

        return recentFiles
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
                mimeType: i.file?.mimeType
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

    } catch (e) {
        return [];
    }
};

export const fetchAllMedia = async (config: AppConfig, user: User): Promise<CloudItem[]> => {
     if (config.simulateMode) return [];
     
     const selectFields = "$expand=thumbnails($select=medium,large)&$select=id,name,folder,file,webUrl,lastModifiedDateTime,size,parentReference,@microsoft.graph.downloadUrl";
     
     try {
         const token = await getAccessToken();
         let allRawItems: any[] = [];

         if (user.role === 'admin') {
             // ADMIN: Quét toàn bộ Root
             const rootUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}:/children?${selectFields}`;
             allRawItems = await crawlFolder(token, rootUrl, selectFields);
         } else {
             // USER THƯỜNG: Quét các nhánh được phép
             const promises = [];

             // 1. Nhánh cá nhân
             const personalUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${user.username}:/children?${selectFields}`;
             promises.push(crawlFolder(token, personalUrl, selectFields));

             // 2. Nhánh chung
             const commonUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Tu_lieu_chung:/children?${selectFields}`;
             promises.push(crawlFolder(token, commonUrl, selectFields));
             
             // 3. Nhánh được cấp quyền
             if (user.allowedPaths && Array.isArray(user.allowedPaths)) {
                 for (const allowedPath of user.allowedPaths) {
                     const allowedUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${allowedPath}:/children?${selectFields}`;
                     promises.push(crawlFolder(token, allowedUrl, selectFields));
                 }
             }
             
             const results = await Promise.all(promises);
             results.forEach(res => allRawItems.push(...res));
         }

         // Lọc và Map
         const systemFiles = ['users.json', 'config.json', 'qrcodes.json'];
         const uniqueMap = new Map();
         allRawItems.forEach(i => {
             if (!systemFiles.includes(i.name.toLowerCase())) {
                 uniqueMap.set(i.id, i);
             }
         });

         return Array.from(uniqueMap.values()).map(mapGraphItemToCloudItem);

     } catch (e) { 
         console.error("Fetch All Media Failed", e);
         return []; 
     }
};

export const fetchSystemStats = async (config: AppConfig): Promise<SystemStats> => {
    if (config.simulateMode) return { totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 };
    try {
        const token = await getAccessToken();
        
        // 1. TỔNG DUNG LƯỢNG
        const folderInfoUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}?select=size`;
        
        // 2. TỔNG SỐ FILE
        const minimalSelect = "$select=id,file,folder";
        const rootCrawlUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}:/children?${minimalSelect}`;

        const [folderRes, allFiles] = await Promise.all([
            fetch(folderInfoUrl, { headers: { 'Authorization': `Bearer ${token}` } }),
            crawlFolder(token, rootCrawlUrl, minimalSelect)
        ]);
        
        let totalStorage = 0;
        let totalFiles = allFiles.length;

        if (folderRes.ok) {
            const folderData = await folderRes.json();
            totalStorage = folderData.size || 0;
        }

        return { totalUsers: 0, activeUsers: 0, totalFiles, totalStorage };
    } catch (e) {
        console.error("Fetch Stats Failed", e);
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
        const date = new Date(); // Giả định duyệt trong tháng hiện tại hoặc cần logic lấy ngày từ record
        const monthStr = `${date.getFullYear()}_${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        // Để đơn giản, giả sử unitCode và monthStr được truyền đúng từ UI
        
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
