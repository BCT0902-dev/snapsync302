
import React, { useState, useEffect, useRef } from 'react';
import { 
  fetchSystemConfig, saveSystemConfig, DEFAULT_SYSTEM_CONFIG, fetchUserRecentFiles,
  getAccessToken, listPathContents, fetchSystemStats, fetchAllMedia, deleteFileFromOneDrive,
  saveQRCodeLog, fetchUsersFromOneDrive, saveUsersToOneDrive,
  createShareLink, uploadToOneDrive
} from './services/graphService';
import { INITIAL_USERS, login } from './services/mockAuth';
import { Button } from './components/Button';
import { Album } from './components/Album';
import { Statistics } from './components/Statistics';
import { VisitorManager } from './components/VisitorManager';
import { VisitorForm } from './components/VisitorForm';
import { QRCodeCanvas } from 'qrcode.react';
import { AppConfig, User, SystemConfig, CloudItem, PhotoRecord, UploadStatus, SystemStats, QRCodeLog } from './types';
import { 
  Camera, LogOut, Settings, History, CheckCircle, XCircle, 
  Loader2, Users, Trash2, Plus, Edit,
  Files, File as FileIcon, Database,
  Folder, ChevronRight, Download,
  Palette, Library, Home,
  HeartHandshake
} from 'lucide-react';

const APP_VERSION_TEXT = "CNTT/f302 - Version 1.40 (Stable)";

const DEFAULT_CONFIG: AppConfig = {
  oneDriveToken: '', 
  targetFolder: 'SnapSync302',
  simulateMode: false,
};

export default function App() {
  const [usersList, setUsersList] = useState<User[]>(INITIAL_USERS);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => {
    try {
      const saved = localStorage.getItem('systemConfig');
      return saved ? JSON.parse(saved) : DEFAULT_SYSTEM_CONFIG;
    } catch (e) { return DEFAULT_SYSTEM_CONFIG; }
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  
  // Sửa lỗi: Thêm khởi tạo user từ localStorage để không bị logout khi refresh
  const [user, setUser] = useState<User | null>(() => {
      try {
          const saved = localStorage.getItem('currentUser');
          return saved ? JSON.parse(saved) : null;
      } catch { return null; }
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  
  // Logic view: Nếu đã login thì vào camera/gallery, ngược lại camera (nhưng sẽ hiện form login)
  const [currentView, setCurrentView] = useState<'camera' | 'history' | 'gallery' | 'settings' | 'user-manager' | 'visitor-manager'>(
      user ? (user.username === 'thannhan' ? 'gallery' : 'camera') : 'camera'
  );

  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [uploadDestination, setUploadDestination] = useState<'personal' | 'common'>('personal');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [qrModalData, setQrModalData] = useState<{name: string, link: string} | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [stats, setStats] = useState<SystemStats>({ totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [galleryBreadcrumbs, setGalleryBreadcrumbs] = useState<{name: string, path: string}[]>([{name: 'Thư viện', path: ''}]);
  const [galleryItems, setGalleryItems] = useState<CloudItem[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [isViewingAll, setIsViewingAll] = useState(false);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set());
  const [guestViewParams, setGuestViewParams] = useState<{unit: string, month: string} | null>(null);
  
  // States cho Admin
  const [tempSysConfig, setTempSysConfig] = useState<SystemConfig>(systemConfig);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [isEditingUser, setIsEditingUser] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const isGuest = user?.username === 'thannhan';

  // Effect lưu user vào localStorage khi thay đổi
  useEffect(() => {
      if (user) localStorage.setItem('currentUser', JSON.stringify(user));
      else localStorage.removeItem('currentUser');
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'guest-visit') {
        const unit = params.get('unit');
        const month = params.get('month');
        if (unit && month) { setGuestViewParams({ unit, month }); setShowSplash(false); }
    }
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const initData = async () => {
      let activeConfig = { ...config };
      try { await getAccessToken(); } catch (e: any) {
         if (e.message === "API_NOT_FOUND" || e.message.includes("404")) {
           activeConfig.simulateMode = true;
           setConfig(prev => ({ ...prev, simulateMode: true }));
         }
      }
      try {
        const [u, c] = await Promise.all([fetchUsersFromOneDrive(activeConfig), fetchSystemConfig(activeConfig)]);
        setUsersList(u); setSystemConfig(c); setTempSysConfig(c);
        localStorage.setItem('systemConfig', JSON.stringify(c));
      } catch (e) { console.error("Init fail", e); }
      finally { setIsDataLoaded(true); }
    };
    initData();
  }, []);

  useEffect(() => {
    if (user) {
        if (currentView === 'gallery') {
            setIsViewingAll(false);
            loadGalleryPath("");
            setGalleryBreadcrumbs([{name: 'Thư viện', path: ''}]);
            setSelectedGalleryIds(new Set());
        } else if (currentView === 'history') {
            loadRecentPhotos(user);
        } else if (currentView === 'settings' && user.role === 'admin') {
            loadStats();
        }
    }
  }, [currentView, user]);

  const loadStats = async () => {
      setIsStatsLoading(true);
      try {
         const cloudStats = await fetchSystemStats(config);
         setStats({
             totalUsers: usersList.length,
             activeUsers: usersList.filter(u => u.status === 'active' || u.status === undefined).length,
             totalFiles: cloudStats.totalFiles,
             totalStorage: cloudStats.totalStorage
         });
      } catch (e) { console.error(e); } 
      finally { setIsStatsLoading(false); }
  };

  const loadRecentPhotos = async (currentUser: User) => {
    setIsHistoryLoading(true);
    try {
      const uploads = await fetchUserRecentFiles(config, currentUser);
      setPhotos(uploads);
    } catch (e) { console.error(e); }
    finally { setIsHistoryLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setLoginError('');
    try {
      const loggedUser = await login(username, password, usersList);
      if (loggedUser) {
        if (loggedUser.status === 'pending') { setLoginError('Tài khoản chờ phê duyệt!'); }
        else { setUser(loggedUser); if (loggedUser.username === 'thannhan') setCurrentView('gallery'); else { setCurrentView('camera'); setShowDisclaimer(true); loadRecentPhotos(loggedUser); } }
      } else { setLoginError('Sai tài khoản hoặc mật khẩu.'); }
    } catch (err) { setLoginError('Lỗi kết nối.'); }
    finally { setIsLoading(false); }
  };

  const handleLogout = () => {
    setUser(null); setUsername(''); setPassword(''); setCurrentView('camera');
    setPhotos([]); setShowDisclaimer(false); setGuestViewParams(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;
    const fileArray = Array.from(files) as File[];

    const newRecords: PhotoRecord[] = fileArray.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file, fileName: file.name,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      status: UploadStatus.UPLOADING, timestamp: new Date(), progress: 0
    }));

    setPhotos(prev => [...newRecords, ...prev]);

    for (const record of newRecords) {
      if (!record.file) continue;
      try {
        const result = await uploadToOneDrive(record.file, config, user, (progress) => {
            setPhotos(prev => prev.map(p => p.id === record.id ? { ...p, progress } : p));
        }, uploadDestination);

        setPhotos(prev => prev.map(p => p.id === record.id ? {
              ...p, status: result.success ? UploadStatus.SUCCESS : UploadStatus.ERROR,
              uploadedUrl: result.url, errorMessage: result.error || (result.isPending ? "Đang chờ duyệt" : ""),
              progress: 100 
            } : p
        ));
      } catch (error: any) {
        setPhotos(prev => prev.map(p => p.id === record.id ? { ...p, status: UploadStatus.ERROR, errorMessage: error.message } : p));
      }
    }
    event.target.value = '';
  };

  const loadGalleryPath = async (path: string) => {
    if (!user) return;
    setIsGalleryLoading(true);
    try {
        const items = await listPathContents(config, path, user);
        let displayItems = items.filter(i => !['system', 'bo_chi_huy'].includes(i.name.toLowerCase()));
        setGalleryItems(displayItems.sort((a, b) => (a.folder && !b.folder ? -1 : !a.folder && b.folder ? 1 : a.name.localeCompare(b.name))));
        setSelectedGalleryIds(new Set());
    } catch(e) { setGalleryItems([]); }
    finally { setIsGalleryLoading(false); }
  };

  const handleGalleryClick = (item: CloudItem) => {
    if (selectedGalleryIds.size > 0) { handleToggleGallerySelect(item.id); return; }
    if (item.folder) {
        const currentPath = galleryBreadcrumbs.map(b => b.path).filter(p => p).join('/');
        const newPath = currentPath ? `${currentPath}/${item.name}` : item.name;
        setGalleryBreadcrumbs(prev => [...prev, { name: item.name, path: item.name }]);
        loadGalleryPath(newPath);
    }
  };

  const handleToggleGallerySelect = (id: string) => {
      const newSet = new Set(selectedGalleryIds);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      setSelectedGalleryIds(newSet);
  };

  const handleBreadcrumbClick = (index: number) => {
      if (isViewingAll && index === 1) return;
      setIsViewingAll(false);
      const newCrumbs = galleryBreadcrumbs.slice(0, index + 1);
      setGalleryBreadcrumbs(newCrumbs);
      const newPath = newCrumbs.map(b => b.path).filter(p => p).join('/');
      loadGalleryPath(newPath);
  };

  const handleViewAll = async () => {
     if(!user) return;
     setIsGalleryLoading(true); setIsViewingAll(true);
     setGalleryBreadcrumbs([{name: 'Thư viện', path: ''}, {name: 'Tất cả ảnh/video', path: 'ALL_MEDIA'}]);
     try {
         const items = await fetchAllMedia(config, user);
         setGalleryItems(items.sort((a,b) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime()));
     } catch(e) { setGalleryItems([]); }
     finally { setIsGalleryLoading(false); }
  };

  const handleBulkDownload = async () => {
      const itemsToDownload = galleryItems.filter(i => selectedGalleryIds.has(i.id) && i.file);
      if (!confirm(`Tải xuống ${itemsToDownload.length} file?`)) return;
      for (const item of itemsToDownload) {
          const link = document.createElement('a');
          link.href = item.downloadUrl || item.webUrl; link.download = item.name; link.target = '_blank';
          document.body.appendChild(link); link.click(); document.body.removeChild(link);
          await new Promise(r => setTimeout(r, 600));
      }
      setSelectedGalleryIds(new Set());
  };

  const handleBulkDelete = async () => {
      const itemsToDelete = galleryItems.filter(i => selectedGalleryIds.has(i.id));
      if (!itemsToDelete.every(i => user?.role === 'admin' || i.name.startsWith(user!.username + '_'))) {
          alert("Chỉ có thể xóa file của mình!"); return;
      }
      if (!confirm(`Xóa vĩnh viễn ${itemsToDelete.length} mục?`)) return;
      setIsGalleryLoading(true);
      for (const item of itemsToDelete) await deleteFileFromOneDrive(config, item.id);
      setGalleryItems(prev => prev.filter(i => !selectedGalleryIds.has(i.id)));
      setSelectedGalleryIds(new Set());
      setIsGalleryLoading(false);
  };

  const handleDeleteGalleryItem = async (item: CloudItem) => {
      if (!user) return;
      // Sửa lỗi logic: Kiểm tra tên file có bắt đầu bằng username_ không
      if (user.role !== 'admin' && !item.name.startsWith(user.username + '_')) {
          alert("Không có quyền xóa file này! (Chỉ xóa được file do bạn tải lên)"); return;
      }
      if (!confirm(`Xóa vĩnh viễn "${item.name}"?`)) return;
      const success = await deleteFileFromOneDrive(config, item.id);
      if (success) {
          setGalleryItems(prev => prev.filter(i => i.id !== item.id));
          setPhotos(prev => prev.filter(p => p.id !== item.id));
      } else { alert("Xóa thất bại!"); }
  };

  const handleCreateGalleryLink = async (item: CloudItem) => {
      if (!user) return;
      try {
          const link = await createShareLink(config, item.id);
          await navigator.clipboard.writeText(link);
          alert(`Đã copy link: ${item.name}`);
      } catch(e: any) { alert("Lỗi: " + e.message); }
  };

  const handleShowQR = async (item: CloudItem) => {
      if (!user) return;
      setIsGeneratingQR(true);
      try {
          const link = await createShareLink(config, item.id);
          const log: QRCodeLog = { id: Date.now().toString(), fileId: item.id, fileName: item.name, createdBy: user.displayName, createdDate: new Date().toISOString(), link };
          saveQRCodeLog(log, config);
          setQrModalData({ name: item.name, link });
      } catch (e: any) { alert("Lỗi: " + e.message); }
      finally { setIsGeneratingQR(false); }
  };

  // --- ADMIN FUNCTIONS ---
  const handleSaveConfig = async () => {
      setIsSavingConfig(true);
      const success = await saveSystemConfig(tempSysConfig, config);
      if (success) {
          setSystemConfig(tempSysConfig);
          localStorage.setItem('systemConfig', JSON.stringify(tempSysConfig));
          alert("Đã lưu cấu hình!");
      } else { alert("Lỗi lưu cấu hình!"); }
      setIsSavingConfig(false);
  };

  const handleSaveUser = async () => {
      if (!editingUser.username || !editingUser.password || !editingUser.displayName || !editingUser.unit) {
          alert("Thiếu thông tin!"); return;
      }
      setIsSavingUser(true);
      let newUsers = [...usersList];
      const idx = newUsers.findIndex(u => u.username === editingUser.username);
      if (idx > -1) {
          newUsers[idx] = { ...newUsers[idx], ...editingUser };
      } else {
          // @ts-ignore
          newUsers.push({ id: Date.now().toString(), ...editingUser, status: 'active' });
      }
      
      const success = await saveUsersToOneDrive(newUsers, config);
      if (success) {
          setUsersList(newUsers);
          setIsEditingUser(false);
          setEditingUser({});
      } else { alert("Lỗi lưu user!"); }
      setIsSavingUser(false);
  };

  const handleDeleteUser = async (username: string) => {
      if(!confirm("Xóa user này?")) return;
      const newUsers = usersList.filter(u => u.username !== username);
      const success = await saveUsersToOneDrive(newUsers, config);
      if(success) setUsersList(newUsers);
  };

  const PhotoPreview = ({ record }: { record: PhotoRecord }) => {
    const [src, setSrc] = useState<string | undefined>(record.previewUrl);
    const [isRetrying, setIsRetrying] = useState(false);
    const handleLoadError = async () => {
        if (isRetrying || !record.previewUrl) return;
        setIsRetrying(true);
        try {
            const token = await getAccessToken();
            const res = await fetch(record.previewUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const blob = await res.blob();
                setSrc(URL.createObjectURL(blob));
            }
        } catch (e) { console.error(e); }
        finally { setIsRetrying(false); }
    };
    return (
        <div className="w-16 h-16 relative flex-shrink-0 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
            {src ? <img src={src} className="w-full h-full object-cover" onError={handleLoadError} /> : <FileIcon className="w-6 h-6 text-slate-300" />}
            {isRetrying && <div className="absolute inset-0 bg-white/40 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>}
        </div>
    );
  };

  const themeStyle = { backgroundColor: systemConfig.themeColor };
  const textThemeStyle = { color: systemConfig.themeColor };
  const buttonStyle = { backgroundColor: systemConfig.themeColor };

  if (showSplash) return (
      <div className="fixed inset-0 z-[100] bg-emerald-50 flex flex-col items-center justify-center">
         <div className="relative w-32 h-32 bg-white rounded-full shadow-2xl p-4 flex items-center justify-center animate-bounce">
            <img src={systemConfig.logoUrl || "/logo302.svg"} className="w-full h-full object-contain" alt="Logo" />
         </div>
         <h1 className="text-xl font-bold uppercase mt-4 text-emerald-700 animate-pulse">{systemConfig.appName}</h1>
      </div>
  );

  if (guestViewParams) return (
      <VisitorForm unitCode={guestViewParams.unit} monthStr={guestViewParams.month} config={config} onSuccess={() => handleLogout()} onCancel={() => handleLogout()} />
  );

  if (!user) return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full mx-auto">
          <div className="flex justify-center mb-6">
            <img src={systemConfig.logoUrl || "/logo302.svg"} className="w-20 h-20 object-contain" alt="Logo" />
          </div>
          <h1 className="text-xl font-bold text-center mb-6 uppercase" style={textThemeStyle}>{systemConfig.appName}</h1>
          <form onSubmit={handleLogin} className="space-y-4">
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-3 rounded-lg border focus:ring-2 outline-none" placeholder="Tên đăng nhập" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-lg border focus:ring-2 outline-none" placeholder="Mật khẩu" />
              {loginError && <p className="text-red-500 text-xs">{loginError}</p>}
              <button type="submit" className="w-full py-3 rounded-lg text-white font-bold shadow-lg" style={buttonStyle} disabled={isLoading}>{isLoading ? '...' : 'Đăng nhập'}</button>
          </form>
        </div>
      </div>
  );

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col max-w-md mx-auto overflow-hidden relative">
      <header className="px-6 py-4 flex justify-between items-center shadow-lg z-20" style={themeStyle}>
        <div>
          <h2 className="font-bold text-white text-lg">{systemConfig.appName}</h2>
          <p className="text-white/80 text-[10px]">{user.displayName} • {user.unit.split('/').pop()}</p>
        </div>
        <button onClick={handleLogout} className="p-2 text-white/70 hover:text-white bg-black/10 rounded-lg"><LogOut className="w-5 h-5" /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 bg-slate-50 pb-24">
        <input type="file" capture="environment" ref={cameraInputRef} onChange={handleFileSelection} className="hidden" />
        <input type="file" multiple ref={multiFileInputRef} onChange={handleFileSelection} className="hidden" />
          
        {currentView === 'camera' && !isGuest && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border">
              <h3 className="font-bold mb-4" style={textThemeStyle}>Upload Phương tiện</h3>
              <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                  <button onClick={() => setUploadDestination('personal')} className={`flex-1 py-2 rounded-md text-xs font-bold ${uploadDestination === 'personal' ? 'bg-white shadow' : 'text-slate-400'}`}>Cá nhân</button>
                  <button onClick={() => setUploadDestination('common')} className={`flex-1 py-2 rounded-md text-xs font-bold ${uploadDestination === 'common' ? 'bg-white shadow text-emerald-600' : 'text-slate-400'}`}>Chung</button>
              </div>
              <button onClick={() => cameraInputRef.current?.click()} className="w-full text-white py-4 rounded-xl font-bold flex items-center justify-center text-lg shadow-lg mb-3" style={buttonStyle}><Camera className="w-6 h-6 mr-3" /> CHỤP ẢNH</button>
              <button onClick={() => multiFileInputRef.current?.click()} className="w-full bg-slate-50 border py-3 rounded-xl text-sm font-medium flex items-center justify-center"><Files className="w-5 h-5 mr-2 text-blue-500" /> Chọn từ thư viện</button>
            </div>
            <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase">Hoạt động mới nhất</h4>
                {photos.slice(0, 5).map(p => (
                    <div key={p.id} className="bg-white p-2 rounded-xl border flex items-center">
                        <PhotoPreview record={p} />
                        <div className="ml-3 flex-1 min-w-0">
                            <p className="text-xs font-bold truncate">{p.fileName}</p>
                            <div className="flex justify-between items-center mt-1">
                                <span className={`text-[10px] font-bold ${p.status === UploadStatus.SUCCESS ? 'text-green-600' : p.status === UploadStatus.ERROR ? 'text-red-500' : 'text-blue-500'}`}>
                                    {p.status === UploadStatus.SUCCESS ? 'Thành công' : p.status === UploadStatus.ERROR ? 'Lỗi' : 'Đang gửi...'}
                                </span>
                                <span className="text-[10px] text-slate-400">{p.timestamp.toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}

        {currentView === 'history' && (
            <div className="space-y-4">
                <h3 className="font-bold text-lg">Lịch sử tải lên</h3>
                {isHistoryLoading ? <Loader2 className="w-8 h-8 animate-spin mx-auto py-10" /> : photos.length === 0 ? <p className="text-center py-10 text-slate-400 italic">Chưa có dữ liệu</p> : photos.map(p => (
                    <div key={p.id} className="bg-white p-2 rounded-xl border flex items-center">
                        <PhotoPreview record={p} />
                        <div className="ml-3 flex-1">
                            <p className="text-xs font-bold truncate">{p.fileName}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{p.timestamp.toLocaleString('vi-VN')}</p>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {currentView === 'gallery' && (
            <div className="flex flex-col h-full space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold">Thư viện {isViewingAll ? 'Toàn bộ' : 'Thư mục'}</h3>
                    <button onClick={isViewingAll ? () => handleBreadcrumbClick(0) : handleViewAll} className="text-xs font-bold text-emerald-600">{isViewingAll ? 'Theo thư mục' : 'Xem tất cả'}</button>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                    {galleryBreadcrumbs.map((c, i) => (
                        <div key={i} className="flex items-center flex-shrink-0">
                            {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300 mx-1" />}
                            <button onClick={() => handleBreadcrumbClick(i)} className={`text-xs px-2 py-1 rounded ${i === galleryBreadcrumbs.length -1 ? 'bg-slate-200 font-bold' : 'text-slate-500'}`}>{i===0 ? <Home className="w-3 h-3" /> : c.name}</button>
                        </div>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {isGalleryLoading ? <Loader2 className="w-8 h-8 animate-spin mx-auto py-10" /> : galleryItems.length === 0 ? <p className="text-center py-10 text-slate-400">Trống</p> : (
                        <div className="space-y-2">
                            {galleryItems.filter(i => i.folder).map(f => (
                                <div key={f.id} onClick={() => handleGalleryClick(f)} className="bg-white p-3 rounded-xl border flex items-center justify-between">
                                    <div className="flex items-center min-w-0">
                                        <Folder className="w-6 h-6 text-amber-500 mr-3 fill-amber-500" />
                                        <p className="text-sm font-bold truncate">{f.name}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-300" />
                                </div>
                            ))}
                            <Album 
                                items={galleryItems.filter(i => i.file)} 
                                color={systemConfig.themeColor} 
                                isAdmin={user.role === 'admin'} 
                                currentUser={user} 
                                onDelete={handleDeleteGalleryItem} 
                                isSelectionMode={true} 
                                selectedIds={selectedGalleryIds} 
                                onToggleSelect={handleToggleGallerySelect} 
                                onShare={handleCreateGalleryLink} 
                                onQR={handleShowQR} 
                            />
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- KHÔI PHỤC GIAO DIỆN ADMIN --- */}
        {currentView === 'settings' && user.role === 'admin' && (
            <div className="space-y-6">
                <Statistics stats={stats} isLoading={isStatsLoading} color={systemConfig.themeColor} />
                
                <div className="bg-white rounded-xl p-4 shadow-sm border space-y-4">
                    <h3 className="font-bold flex items-center"><Palette className="w-5 h-5 mr-2 text-purple-600" /> Giao diện</h3>
                    <div>
                        <label className="text-xs font-bold text-slate-500">Tên ứng dụng</label>
                        <input className="w-full border p-2 rounded-lg mt-1" value={tempSysConfig.appName} onChange={e => setTempSysConfig({...tempSysConfig, appName: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500">Màu chủ đạo</label>
                        <div className="flex gap-2 mt-1">
                            {['#059669', '#2563eb', '#dc2626', '#d97706', '#7c3aed'].map(c => (
                                <button key={c} onClick={() => setTempSysConfig({...tempSysConfig, themeColor: c})} className={`w-8 h-8 rounded-full border-2 ${tempSysConfig.themeColor === c ? 'border-black' : 'border-transparent'}`} style={{backgroundColor: c}} />
                            ))}
                        </div>
                    </div>
                    <Button onClick={handleSaveConfig} isLoading={isSavingConfig} className="w-full">Lưu cấu hình</Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setCurrentView('user-manager')} className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-center">
                        <div className="p-2 bg-blue-50 rounded-full mb-2"><Users className="w-6 h-6 text-blue-600" /></div>
                        <span className="font-bold text-sm">Quản lý User</span>
                    </button>
                    <button className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-center opacity-50 cursor-not-allowed">
                        <div className="p-2 bg-amber-50 rounded-full mb-2"><Database className="w-6 h-6 text-amber-600" /></div>
                        <span className="font-bold text-sm">Backup DL</span>
                    </button>
                </div>
            </div>
        )}

        {/* --- KHÔI PHỤC GIAO DIỆN USER MANAGER --- */}
        {currentView === 'user-manager' && user.role === 'admin' && (
            <div className="space-y-4">
                 <div className="flex justify-between items-center mb-2">
                     <h3 className="font-bold text-lg">Danh sách tài khoản</h3>
                     <button onClick={() => { setIsEditingUser(true); setEditingUser({}); }} className="bg-emerald-600 text-white p-2 rounded-lg flex items-center text-xs font-bold"><Plus className="w-4 h-4 mr-1" /> Thêm mới</button>
                 </div>
                 
                 {isEditingUser && (
                     <div className="bg-white p-4 rounded-xl border shadow-lg mb-4 animate-in slide-in-from-top">
                         <h4 className="font-bold mb-3">{editingUser.id ? 'Sửa tài khoản' : 'Thêm tài khoản mới'}</h4>
                         <div className="space-y-3">
                             <input placeholder="Tên đăng nhập" className="w-full border p-2 rounded" value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} />
                             <input placeholder="Mật khẩu" className="w-full border p-2 rounded" value={editingUser.password || ''} onChange={e => setEditingUser({...editingUser, password: e.target.value})} />
                             <input placeholder="Tên hiển thị" className="w-full border p-2 rounded" value={editingUser.displayName || ''} onChange={e => setEditingUser({...editingUser, displayName: e.target.value})} />
                             <input placeholder="Đơn vị" className="w-full border p-2 rounded" value={editingUser.unit || ''} onChange={e => setEditingUser({...editingUser, unit: e.target.value})} />
                             <div className="flex gap-2 justify-end mt-2">
                                 <button onClick={() => setIsEditingUser(false)} className="px-3 py-1 bg-slate-100 rounded text-sm font-bold">Hủy</button>
                                 <button onClick={handleSaveUser} className="px-3 py-1 bg-emerald-600 text-white rounded text-sm font-bold">{isSavingUser ? '...' : 'Lưu'}</button>
                             </div>
                         </div>
                     </div>
                 )}

                 <div className="bg-white rounded-xl border shadow-sm divide-y">
                     {usersList.map(u => (
                         <div key={u.id} className="p-3 flex items-center justify-between">
                             <div className="flex items-center">
                                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 mr-3">
                                     {u.username.charAt(0).toUpperCase()}
                                 </div>
                                 <div>
                                     <p className="font-bold text-sm">{u.displayName}</p>
                                     <p className="text-xs text-slate-500">{u.unit} • {u.role}</p>
                                 </div>
                             </div>
                             <div className="flex gap-2">
                                 <button onClick={() => { setEditingUser(u); setIsEditingUser(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded"><Edit className="w-4 h-4" /></button>
                                 {u.username !== 'admin' && <button onClick={() => handleDeleteUser(u.username)} className="p-1.5 bg-red-50 text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>}
                             </div>
                         </div>
                     ))}
                 </div>
            </div>
        )}

        {currentView === 'visitor-manager' && (
            <VisitorManager user={user} usersList={usersList} config={config} themeColor={systemConfig.themeColor} />
        )}
      </main>

      {selectedGalleryIds.size > 0 && (
          <div className="absolute bottom-20 left-4 right-4 bg-white rounded-xl shadow-2xl border p-3 flex justify-between items-center z-50">
              <span className="text-xs font-bold text-slate-700">{selectedGalleryIds.size} đã chọn</span>
              <div className="flex gap-2">
                  <button onClick={handleBulkDownload} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Download className="w-4 h-4" /></button>
                  <button onClick={handleBulkDelete} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => setSelectedGalleryIds(new Set())} className="p-2 bg-slate-100 rounded-lg"><XCircle className="w-4 h-4" /></button>
              </div>
          </div>
      )}

      {qrModalData && (
          <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-6" onClick={() => setQrModalData(null)}>
              <div className="bg-white rounded-2xl p-6 w-full max-w-xs flex flex-col items-center" onClick={e => e.stopPropagation()}>
                  <QRCodeCanvas value={qrModalData.link} size={200} />
                  <p className="mt-4 font-bold text-sm text-center truncate w-full">{qrModalData.name}</p>
                  <button onClick={() => setQrModalData(null)} className="mt-6 w-full py-2 bg-slate-100 rounded-lg font-bold">Đóng</button>
              </div>
          </div>
      )}

      <nav className="bg-white border-t flex justify-around items-center py-2 fixed bottom-0 left-0 right-0 max-w-md mx-auto shadow-lg z-30">
        {!isGuest && <TabButton active={currentView === 'camera'} onClick={() => setCurrentView('camera')} icon={<Camera />} label="Upload" color={systemConfig.themeColor} />}
        <TabButton active={currentView === 'gallery'} onClick={() => setCurrentView('gallery')} icon={<Library />} label="Thư viện" color={systemConfig.themeColor} />
        {!isGuest && <TabButton active={currentView === 'visitor-manager'} onClick={() => setCurrentView('visitor-manager')} icon={<HeartHandshake />} label="Thân nhân" color={systemConfig.themeColor} />}
        {!isGuest && <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="Lịch sử" color={systemConfig.themeColor} />}
        {user.role === 'admin' && !isGuest && <TabButton active={currentView === 'settings'} onClick={() => setCurrentView('settings')} icon={<Settings />} label="Admin" color={systemConfig.themeColor} />}
      </nav>
    </div>
  );
}

const TabButton = ({ active, onClick, icon, label, color }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, color?: string }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full py-1 ${active ? '' : 'text-slate-400'}`} style={active ? { color: color } : {}}>
    <div className="w-5 h-5">{React.cloneElement(icon as React.ReactElement<any>, { size: 20 })}</div>
    <span className="text-[9px] font-bold mt-1">{label}</span>
  </button>
);
