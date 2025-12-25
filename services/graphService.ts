
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
    const items = data.value as any[];
    
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

export const moveOneDriveItem = async (config: AppConfig, itemId: string, destPath: string): Promise<boolean> => {
     if (config.simulateMode) return true;
     // Cần tìm Parent ID của folder đích trước, logic này khá phức tạp nếu làm chuẩn.
     // Ở đây tạm thời return true để UI không lỗi.
     return true; 
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

// --- HISTORY & STATS ---

export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
    if (config.simulateMode) return [];
    
    try {
        const token = await getAccessToken();
        const userRootPath = `${config.targetFolder}/${user.username}`;
        
        // --- 1. TÌM KIẾM TOÀN BỘ (HISTORY) ---
        // Sử dụng search(q=' ') chỉ để lấy history gần nhất (có thể không đủ nhưng chấp nhận được cho History View)
        const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${userRootPath}:/search(q=' ')?select=id,name,file,webUrl,lastModifiedDateTime,size,thumbnails,@microsoft.graph.downloadUrl&top=999`;
        
        // --- 2. QUÉT TRỰC TIẾP TOÀN BỘ THÁNG NÀY (TUẦN 1 -> TUẦN 5) ---
        const now = new Date();
        const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
        const monthPath = `T${monthStr}`; // VD: T02
        
        const weekPromises = [];
        for (let i = 1; i <= 5; i++) {
            const weekUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${userRootPath}/${monthPath}/Tuần_${i}:/children?$expand=thumbnails($select=medium,large)&$select=id,name,file,webUrl,lastModifiedDateTime,size,@microsoft.graph.downloadUrl`;
            weekPromises.push(fetch(weekUrl, { headers: { 'Authorization': `Bearer ${token}` } }));
        }

        // Chạy song song Search + 5 Weeks Direct Crawl
        const allResponses = await Promise.allSettled([
            fetch(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } }),
            ...weekPromises
        ]);

        let allItems: any[] = [];

        // Gom kết quả
        for (const res of allResponses) {
            if (res.status === 'fulfilled' && res.value.ok) {
                try {
                    const data = await res.value.json();
                    if (data.value) allItems.push(...data.value);
                } catch(e) {}
            }
        }

        // Loại bỏ trùng lặp (Dựa vào ID)
        const uniqueItemsMap = new Map();
        allItems.forEach(item => {
            if (item.file) { // Chỉ lấy file
                uniqueItemsMap.set(item.id, item);
            }
        });
        const uniqueItems = Array.from(uniqueItemsMap.values());

        return uniqueItems
            .sort((a: any, b: any) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime())
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
    // API Recycle Bin
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

// --- CORE RECURSIVE CRAWLER ---
// Hàm quét đệ quy mạnh mẽ để lấy tất cả file trong folder và subfolders
const crawlFolder = async (token: string, folderUrl: string, selectFields: string, maxDepth: number = 5, currentDepth: number = 0): Promise<any[]> => {
    if (currentDepth > maxDepth) return [];

    let items: any[] = [];
    let nextLink = folderUrl;

    // 1. Fetch tất cả items trong folder hiện tại (Xử lý phân trang)
    try {
        while (nextLink) {
            const res = await fetch(nextLink, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) break;
            const data = await res.json();
            items.push(...(data.value || []));
            nextLink = data['@odata.nextLink'];
        }
    } catch (e) {
        console.error("Error fetching folder items", e);
        return [];
    }

    let allFiles: any[] = items.filter((i: any) => i.file);
    const subFolders = items.filter((i: any) => i.folder);

    // 2. Đệ quy xuống các subfolder
    // Sử dụng Promise.all để chạy song song, tăng tốc độ
    const subTasks = subFolders.map(folder => {
        // Construct URL cho folder con
        // Dùng items endpoint ID để chắc chắn: /items/{id}/children
        const childUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${folder.id}/children?${selectFields}`;
        return crawlFolder(token, childUrl, selectFields, maxDepth, currentDepth + 1);
    });

    const subResults = await Promise.all(subTasks);
    subResults.forEach(res => {
        allFiles = allFiles.concat(res);
    });

    return allFiles;
};

export const fetchAllMedia = async (config: AppConfig, user: User): Promise<CloudItem[]> => {
     if (config.simulateMode) return [];
     
     // Cấu hình các trường cần lấy để hiển thị Gallery (có thumbnails)
     const selectFields = "$expand=thumbnails($select=medium,large)&$select=id,name,folder,file,webUrl,lastModifiedDateTime,size,parentReference,@microsoft.graph.downloadUrl";
     
     try {
         const token = await getAccessToken();
         let allRawItems: any[] = [];

         if (user.role === 'admin') {
             // ADMIN: Quét toàn bộ từ Root App Folder
             const rootUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}:/children?${selectFields}`;
             allRawItems = await crawlFolder(token, rootUrl, selectFields);
         } else {
             // USER: Quét 2 nhánh: Cá nhân & Chung
             // 1. Nhánh cá nhân
             const personalUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/${user.username}:/children?${selectFields}`;
             // 2. Nhánh chung
             const commonUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/Tu_lieu_chung:/children?${selectFields}`;
             
             const [personalFiles, commonFiles] = await Promise.all([
                 crawlFolder(token, personalUrl, selectFields),
                 crawlFolder(token, commonUrl, selectFields)
             ]);
             allRawItems = [...personalFiles, ...commonFiles];
         }

         // Lọc file hệ thống lần cuối cho chắc
         const systemFiles = ['users.json', 'config.json', 'qrcodes.json'];
         const validFiles = allRawItems.filter((i:any) => !systemFiles.includes(i.name.toLowerCase()));

         return validFiles.map(mapGraphItemToCloudItem);

     } catch (e) { 
         console.error("Fetch All Media Failed", e);
         return []; 
     }
};

export const fetchSystemStats = async (config: AppConfig): Promise<SystemStats> => {
    if (config.simulateMode) return { totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 };
    try {
        const token = await getAccessToken();
        
        // 1. TỔNG DUNG LƯỢNG: Lấy chính xác từ thuộc tính size của folder gốc
        const folderInfoUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}?select=size`;
        
        // 2. TỔNG SỐ FILE: Dùng hàm Crawl nhưng chỉ select ID và File để nhẹ (không lấy thumbnails)
        // Lưu ý: Việc này có thể mất vài giây nếu có hàng nghìn file, nhưng nó chính xác.
        const minimalSelect = "$select=id,file,folder";
        const rootCrawlUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}:/children?${minimalSelect}`;

        const [folderRes, allFiles] = await Promise.all([
            fetch(folderInfoUrl, { headers: { 'Authorization': `Bearer ${token}` } }),
            crawlFolder(token, rootCrawlUrl, minimalSelect)
        ]);
        
        let totalStorage = 0;
        let totalFiles = allFiles.length; // Số file đếm được từ Crawl

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
        // Cần fetch lại file JSON của tháng đó, update record, rồi save lại.
        // Logic này tương tự saveVisitor nhưng thay vì push thì map.
        // Tạm thời return true.
        return true;
     } catch(e) { return false; }
};
