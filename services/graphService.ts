
import { AppConfig, User, SystemConfig, CloudItem, PhotoRecord, UploadStatus, SystemStats, QRCodeLog, VisitorRecord } from '../types';
import { INITIAL_USERS } from './mockAuth';

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  appName: 'Mediaf302',
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
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Không có Access Token");
  } catch (e: any) {
    if (e.message === "Failed to fetch") throw new Error("API_NOT_FOUND");
    throw e;
  }
};

const getHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
});

// --- QUẢN LÝ NGƯỜI DÙNG ---

export const fetchUsersFromOneDrive = async (config: AppConfig): Promise<User[]> => {
  if (config.simulateMode) return INITIAL_USERS;
  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/users.json:/content`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) return await res.json();
    return INITIAL_USERS;
  } catch (e) {
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
  } catch (e) { return false; }
};

// --- CẤU HÌNH HỆ THỐNG ---

export const fetchSystemConfig = async (config: AppConfig): Promise<SystemConfig> => {
  if (config.simulateMode) return DEFAULT_SYSTEM_CONFIG;
  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/config.json:/content`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) return await res.json();
    return DEFAULT_SYSTEM_CONFIG;
  } catch (e) { return DEFAULT_SYSTEM_CONFIG; }
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
  } catch (e) { return false; }
};

// --- THAO TÁC FILE ---

export const listPathContents = async (config: AppConfig, path: string, user?: User): Promise<CloudItem[]> => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
    const folderPath = cleanPath ? `${config.targetFolder}/${cleanPath}` : config.targetFolder;
    
    // Sử dụng encodeURIComponent để xử lý tên thư mục có dấu tiếng Việt/khoảng trắng
    const encodedPath = folderPath.split('/').map(p => encodeURIComponent(p)).join('/');
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/children?$select=id,name,folder,file,webUrl,lastModifiedDateTime,size,video,image,@microsoft.graph.downloadUrl`;
    
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return [];
    
    const data = await res.json();
    return (data.value || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      folder: i.folder,
      file: i.file,
      webUrl: i.webUrl,
      lastModifiedDateTime: i.lastModifiedDateTime,
      size: i.size,
      downloadUrl: i['@microsoft.graph.downloadUrl'],
      thumbnailUrl: i['@microsoft.graph.downloadUrl']
    }));
  } catch (e) { return []; }
};

export const uploadToOneDrive = async (file: File, config: AppConfig, user: User, onProgress: (p: number) => void, destination: string): Promise<{success: boolean, url?: string, error?: string, isPending?: boolean}> => {
  if (config.simulateMode) {
      onProgress(100);
      return { success: true, url: 'http://mock.url', isPending: destination === 'common' };
  }
  
  try {
    const token = await getAccessToken();
    const now = new Date();
    const monthStr = `T${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const weekStr = `Tuần_${Math.min(4, Math.ceil(now.getDate() / 7))}`;
    
    // Fix logic đường dẫn cho folder chung
    const folderPath = destination === 'personal' ? 
        `${config.targetFolder}/${user.username}/${monthStr}/${weekStr}` :
        `${config.targetFolder}/Tu_lieu_chung_Cho_duyet/${user.username}`;
    
    // SỬA LỖI QUAN TRỌNG: Thêm username vào tên file để logic xóa file hoạt động đúng
    const safeName = `${user.username}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const encodedPath = folderPath.split('/').map(p => encodeURIComponent(p)).join('/');
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}/${safeName}:/content`;
    
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type },
        body: file
    });

    if (res.ok) {
        onProgress(100);
        const data = await res.json();
        return { success: true, url: data.webUrl, isPending: destination === 'common' };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, error: err.error?.message || "Lỗi tải lên" };
  } catch (e: any) { return { success: false, error: e.message }; }
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

export const createShareLink = async (config: AppConfig, itemId: string): Promise<string> => {
    if (config.simulateMode) return "http://mock.share.link";
    try {
        const token = await getAccessToken();
        const url = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`;
        const res = await fetch(url, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({ type: 'view', scope: 'anonymous' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Không thể tạo link");
        return data.link.webUrl;
    } catch (e: any) { throw new Error(e.message); }
};

// --- LỊCH SỬ & THỐNG KÊ ---

export const fetchUserRecentFiles = async (config: AppConfig, user: User): Promise<PhotoRecord[]> => {
    if (config.simulateMode) return [];
    try {
        const token = await getAccessToken();
        // Cải thiện query search để tìm chính xác trong folder của user
        const searchPath = `${config.targetFolder}/${user.username}`;
        const encodedPath = searchPath.split('/').map(p => encodeURIComponent(p)).join('/');
        
        // Nếu folder chưa tồn tại (user mới), search có thể lỗi 404, trả về rỗng thay vì lỗi
        const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/search(q='')?$select=id,name,file,lastModifiedDateTime,size,@microsoft.graph.downloadUrl&top=50`;
        const res = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return [];
        const data = await res.json();
        
        return (data.value || [])
            .filter((i: any) => i.file) // Chỉ lấy file
            .sort((a: any, b: any) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime())
            .map((i: any) => ({
                id: i.id,
                fileName: i.name,
                status: UploadStatus.SUCCESS,
                timestamp: new Date(i.lastModifiedDateTime),
                previewUrl: i['@microsoft.graph.downloadUrl'],
                size: i.size,
                mimeType: i.file.mimeType
            }));
    } catch (e) { return []; }
};

export const fetchAllMedia = async (config: AppConfig, user: User): Promise<CloudItem[]> => {
     if (config.simulateMode) return [];
     try {
         const token = await getAccessToken();
         // Search toàn bộ folder gốc
         const rootPath = config.targetFolder;
         const encodedPath = encodeURIComponent(rootPath);
         
         const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/search(q='')?select=id,name,file,folder,webUrl,lastModifiedDateTime,size,@microsoft.graph.downloadUrl&top=100`;
         const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
         if (!res.ok) return [];
         const data = await res.json();
         return (data.value || []).filter((i:any) => i.file).map((i:any) => ({
             id: i.id,
             name: i.name,
             file: i.file,
             webUrl: i.webUrl,
             lastModifiedDateTime: i.lastModifiedDateTime,
             size: i.size,
             downloadUrl: i['@microsoft.graph.downloadUrl'],
             thumbnailUrl: i['@microsoft.graph.downloadUrl']
         }));
     } catch (e) { return []; }
};

export const fetchSystemStats = async (config: AppConfig): Promise<SystemStats> => {
    if (config.simulateMode) return { totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 };
    try {
        const token = await getAccessToken();
        const encodedPath = encodeURIComponent(config.targetFolder);
        const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}?$select=id,size,folder`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return { totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 };
        const data = await res.json();
        return { 
            totalUsers: 0, 
            activeUsers: 0, 
            totalFiles: data.folder?.childCount || 0, 
            totalStorage: data.size || 0 
        };
    } catch (e) { return { totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 }; }
};

// --- QR LOGS ---

export const saveQRCodeLog = async (log: QRCodeLog, config: AppConfig): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const token = await getAccessToken();
    // Lấy log hiện tại trước
    let logs: QRCodeLog[] = [];
    const urlGet = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/qrcodes.json:/content`;
    const resGet = await fetch(urlGet, { headers: { 'Authorization': `Bearer ${token}` } });
    if(resGet.ok) logs = await resGet.json();
    
    logs.push(log);
    
    const urlPut = `https://graph.microsoft.com/v1.0/me/drive/root:/${config.targetFolder}/System/qrcodes.json:/content`;
    const resPut = await fetch(urlPut, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(logs, null, 2)
    });
    return resPut.ok;
  } catch (error) { return false; }
};

// --- VISITOR MANAGEMENT ---

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
        const res = await fetch(url, { method: 'PUT', headers: getHeaders(token), body: JSON.stringify(currentVisitors, null, 2) });
        return res.ok;
    } catch(e) { return false; }
};

export const updateVisitorStatus = async (config: AppConfig, unitCode: string, recordId: string, status: 'pending' | 'approved' | 'completed'): Promise<boolean> => {
     if (config.simulateMode) return true;
     try {
         const token = await getAccessToken();
         const items = await listPathContents(config, 'Visits');
         const unitFiles = items.filter(i => i.name.startsWith(unitCode + '_'));
         
         for (const file of unitFiles) {
             const fileUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`;
             const res = await fetch(fileUrl, { headers: { 'Authorization': `Bearer ${token}` } });
             if (res.ok) {
                 const records: VisitorRecord[] = await res.json();
                 const idx = records.findIndex(r => r.id === recordId);
                 if (idx > -1) {
                     records[idx].status = status;
                     const update = await fetch(fileUrl, { method: 'PUT', headers: getHeaders(token), body: JSON.stringify(records, null, 2) });
                     return update.ok;
                 }
             }
         }
         return false;
     } catch (e) { return false; }
};
