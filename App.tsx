
import React, { useState, useRef, useEffect } from 'react';
import { User, PhotoRecord, UploadStatus, AppConfig, SystemConfig } from './types';
import { INITIAL_USERS, login } from './services/mockAuth';
import { 
  uploadToOneDrive, fetchUsersFromOneDrive, saveUsersToOneDrive, 
  listUserMonthFolders, listFilesInMonthFolder, createShareLink,
  fetchSystemConfig, saveSystemConfig, DEFAULT_SYSTEM_CONFIG
} from './services/graphService';
import { Button } from './components/Button';
import { 
  Camera, LogOut, Info, Settings, History, CheckCircle, XCircle, 
  Loader2, Image as ImageIcon, Users, Trash2, Plus, Edit,
  FileArchive, Film, FolderUp, Files, File as FileIcon, RefreshCw, Database,
  Share2, Folder, FolderOpen, Link as LinkIcon, ChevronLeft, Download,
  AlertTriangle, Shield, Palette, Save
} from 'lucide-react';

const APP_VERSION_TEXT = "CNTT/f302 - Version 1.2";

const DEFAULT_CONFIG: AppConfig = {
  oneDriveToken: '', 
  targetFolder: 'SnapSync302',
  simulateMode: false,
};

const UNIT_SUGGESTIONS = [
  "Sư đoàn 302/Phòng Tham mưu", 
  "Sư đoàn 302/Phòng Chính trị", 
  "Sư đoàn 302/Phòng HC-KT",
  "Trung đoàn 88/Ban Tham mưu",
  "Trung đoàn 88/Ban Chính trị",
  "Trung đoàn 88/Ban HC-KT",
  "Trung đoàn 88/Tiểu đoàn 4/Đại đội 1",
  "Trung đoàn 88/Tiểu đoàn 4/Đại đội 2",
  "Trung đoàn 88/Tiểu đoàn 4/Đại đội 3",
  "Trung đoàn 88/Tiểu đoàn 4/Đại đội 4",
  "Trung đoàn 88/Tiểu đoàn 5/Đại đội 5",
  "Trung đoàn 88/Tiểu đoàn 5/Đại đội 6",
  "Trung đoàn 88/Tiểu đoàn 5/Đại đội 7",
  "Trung đoàn 88/Tiểu đoàn 5/Đại đội 8",
  "Trung đoàn 88/Tiểu đoàn 6/Đại đội 9",
  "Trung đoàn 88/Tiểu đoàn 6/Đại đội 10",
  "Trung đoàn 88/Tiểu đoàn 6/Đại đội 11",
  "Trung đoàn 88/Tiểu đoàn 6/Đại đội 12",
];

export default function App() {
  // --- STATE ---
  const [usersList, setUsersList] = useState<User[]>(INITIAL_USERS);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false); // Popup state
  
  // Views: camera, history, share, settings
  const [currentView, setCurrentView] = useState<'camera' | 'history' | 'share' | 'settings'>('camera');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  
  // User Management State
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [isSavingUser, setIsSavingUser] = useState(false);
  
  // System Config State (For Admin Edit)
  const [tempSysConfig, setTempSysConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Share View State
  const [shareFolders, setShareFolders] = useState<any[]>([]);
  const [currentShareFolder, setCurrentShareFolder] = useState<string | null>(null);
  const [shareFiles, setShareFiles] = useState<any[]>([]);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const [sharingItem, setSharingItem] = useState<string | null>(null); 

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECTS ---
  useEffect(() => {
    const initData = async () => {
      try {
        const [cloudUsers, cloudConfig] = await Promise.all([
          fetchUsersFromOneDrive(config),
          fetchSystemConfig(config)
        ]);
        setUsersList(cloudUsers);
        setSystemConfig(cloudConfig);
        setTempSysConfig(cloudConfig);
      } catch (e) {
        console.error("Lỗi khởi tạo data:", e);
      } finally {
        setIsDataLoaded(true);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    if (currentView === 'share' && user) {
      loadShareFolders();
    }
  }, [currentView, user]);

  // --- HANDLERS ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    
    // Nếu data chưa load xong, thử load lại
    let currentList = usersList;
    if (!isDataLoaded) {
       try {
         const [u, c] = await Promise.all([fetchUsersFromOneDrive(config), fetchSystemConfig(config)]);
         currentList = u;
         setUsersList(u);
         setSystemConfig(c);
         setIsDataLoaded(true);
       } catch (ex) { console.log("Retry load data failed"); }
    }

    try {
      const loggedUser = await login(username, password, currentList);
      if (loggedUser) {
        setUser(loggedUser);
        setCurrentView('camera');
        setShowDisclaimer(true); // Hiển thị popup sau khi login thành công
      } else {
        setLoginError('Tài khoản hoặc mật khẩu không đúng.');
      }
    } catch (err) {
      setLoginError('Lỗi kết nối.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setUsername('');
    setPassword('');
    setCurrentView('camera');
    setShareFolders([]);
    setShareFiles([]);
    setCurrentShareFolder(null);
    setShowDisclaimer(false);
  };

  const handleReloadDB = async () => {
    setIsSavingUser(true);
    try {
      const cloudUsers = await fetchUsersFromOneDrive(config);
      setUsersList(cloudUsers);
      alert("Đã cập nhật dữ liệu mới nhất từ hệ thống!");
    } catch (e) {
      alert("Lỗi cập nhật dữ liệu.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleSaveSystemConfig = async () => {
    if (!confirm("Bạn có chắc chắn muốn thay đổi giao diện cho TOÀN BỘ hệ thống không?")) return;
    setIsSavingConfig(true);
    try {
      const success = await saveSystemConfig(tempSysConfig, config);
      if (success) {
        setSystemConfig(tempSysConfig);
        alert("Đã lưu cấu hình thành công!");
      } else {
        alert("Lỗi lưu cấu hình.");
      }
    } catch(e) {
      console.error(e);
      alert("Có lỗi xảy ra.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  // ... (Giữ nguyên các hàm handleFileSelection, loadShareFolders, openShareFolder, handleCreateLink, getFileIcon, getPreview)
  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    const newRecords: PhotoRecord[] = fileArray.map(file => ({
      id: Date.now().toString() + Math.random().toString(),
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      status: UploadStatus.UPLOADING,
      timestamp: new Date(),
    }));

    setPhotos(prev => [...newRecords, ...prev]);

    for (const record of newRecords) {
      try {
        const result = await uploadToOneDrive(record.file, config, user);
        setPhotos(prev => prev.map(p => {
          if (p.id === record.id) {
            return {
              ...p,
              status: result.success ? UploadStatus.SUCCESS : UploadStatus.ERROR,
              uploadedUrl: result.url,
              errorMessage: result.error
            };
          }
          return p;
        }));
      } catch (error: any) {
        setPhotos(prev => prev.map(p => {
          if (p.id === record.id) {
            return {
              ...p,
              status: UploadStatus.ERROR,
              errorMessage: error.message || "Lỗi không xác định"
            };
          }
          return p;
        }));
      }
    }
    event.target.value = '';
  };

  const loadShareFolders = async () => {
    if (!user) return;
    setIsLoadingShare(true);
    try {
      const folders = await listUserMonthFolders(config, user);
      setShareFolders(folders.sort((a: any, b: any) => b.name.localeCompare(a.name)));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingShare(false);
    }
  };

  const openShareFolder = async (folderName: string) => {
    if (!user) return;
    setIsLoadingShare(true);
    setCurrentShareFolder(folderName);
    try {
      const files = await listFilesInMonthFolder(config, user, folderName);
      setShareFiles(files);
    } catch (e) {
      console.error(e);
      setShareFiles([]);
    } finally {
      setIsLoadingShare(false);
    }
  };

  const handleCreateLink = async (itemName: string, isFolder: boolean) => {
    if (!user) return;
    setSharingItem(itemName);
    try {
      const relativePath = isFolder ? itemName : `${currentShareFolder}/${itemName}`;
      const link = await createShareLink(config, user, relativePath);
      await navigator.clipboard.writeText(link);
      alert(`Đã copy link chia sẻ ${isFolder ? 'thư mục' : 'file'}!\n\n${link}`);
    } catch (error: any) {
      alert(`Lỗi tạo link: ${error.message}`);
    } finally {
      setSharingItem(null);
    }
  };

  const getFileIcon = (file: File | { name: string, file?: any }) => {
    const name = 'name' in file ? file.name : (file as File).name;
    const type = 'type' in file ? (file as File).type : '';
    if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return <ImageIcon className="w-6 h-6 text-emerald-600" />;
    if (type.startsWith('video/') || name.match(/\.(mp4|mov|avi|mkv)$/i)) return <Film className="w-6 h-6 text-blue-600" />;
    if (name.match(/\.(zip|rar|7z)$/i)) return <FileArchive className="w-6 h-6 text-amber-600" />;
    return <FileIcon className="w-6 h-6 text-slate-400" />;
  };

  const getPreview = (record: PhotoRecord) => {
    if (record.previewUrl) return <img src={record.previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg bg-slate-100 border border-slate-200" />;
    return <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200">{getFileIcon(record.file)}</div>;
  };

  // --- USER MANAGEMENT HANDLERS ---
  const handleDeleteUser = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa cán bộ này?')) return;
    setIsSavingUser(true);
    const newList = usersList.filter(u => u.id !== id);
    setUsersList(newList);
    await saveUsersToOneDrive(newList, config);
    setIsSavingUser(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.username || !editingUser.password || !editingUser.displayName || !editingUser.unit) {
      alert("Vui lòng điền đầy đủ thông tin");
      return;
    }
    setIsSavingUser(true);
    let newList = [...usersList];
    if (editingUser.id) {
      newList = newList.map(u => u.id === editingUser.id ? { ...u, ...editingUser } as User : u);
    } else {
      if (newList.some(u => u.username.toLowerCase() === editingUser.username?.toLowerCase())) {
        alert("Tên đăng nhập đã tồn tại!");
        setIsSavingUser(false);
        return;
      }
      const newUser: User = {
        id: Date.now().toString(),
        username: editingUser.username,
        password: editingUser.password,
        displayName: editingUser.displayName,
        unit: editingUser.unit,
        role: 'staff'
      } as User;
      newList.push(newUser);
    }
    setUsersList(newList);
    const success = await saveUsersToOneDrive(newList, config);
    if (success) {
      setIsEditingUser(false);
      setEditingUser({});
    } else {
      alert("Lỗi: Không thể lưu dữ liệu lên OneDrive.");
    }
    setIsSavingUser(false);
  };

  const startEditUser = (u?: User) => {
    setEditingUser(u || { role: 'staff' });
    setIsEditingUser(true);
  };

  // --- RENDER ---
  const themeStyle = { backgroundColor: systemConfig.themeColor };
  const textThemeStyle = { color: systemConfig.themeColor };
  const buttonStyle = { backgroundColor: systemConfig.themeColor };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full mx-auto">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-full flex items-center justify-center border-4 border-white shadow-md overflow-hidden bg-white">
              <img src={systemConfig.logoUrl} className="w-full h-full object-cover" alt="Logo" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1 uppercase tracking-tight" style={textThemeStyle}>{systemConfig.appName}</h1>
          <p className="text-center text-slate-500 font-medium mb-6 text-sm">Hệ thống upload hình ảnh quân nhân</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:outline-none transition-colors focus:border-transparent" style={{ '--tw-ring-color': systemConfig.themeColor } as React.CSSProperties} placeholder="Nhập tên đăng nhập" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:outline-none transition-colors focus:border-transparent" style={{ '--tw-ring-color': systemConfig.themeColor } as React.CSSProperties} placeholder="Nhập mật khẩu" />
            </div>
            {loginError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center"><Info className="w-4 h-4 mr-2" />{loginError}</div>}
            {!isDataLoaded && <div className="text-center text-xs text-blue-600 animate-pulse">Đang kết nối hệ thống...</div>}
            <button type="submit" className="w-full font-bold shadow-lg text-white py-3 rounded-lg hover:opacity-90 transition-opacity" style={buttonStyle} disabled={isLoading || !isDataLoaded}>
              {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
            </button>
          </form>
          <div className="mt-8 text-center text-xs text-slate-400">{APP_VERSION_TEXT}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {/* Disclaimer Modal */}
      {showDisclaimer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full border-t-4 border-amber-500">
              <div className="flex items-center text-amber-600 mb-3 font-bold text-lg">
                <Shield className="w-6 h-6 mr-2" />
                QUY ĐỊNH BẢO MẬT
              </div>
              <div className="text-slate-700 text-sm space-y-3 leading-relaxed text-justify">
                <p>Đây là cổng lưu trữ hình ảnh, video cuộc sống thường ngày của quân nhân, chiến sĩ Sư đoàn 302.</p>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <p className="font-medium text-amber-800">
                    Vui lòng <strong>KHÔNG</strong> đăng tải các hình ảnh, video có nội dung bí mật quân sự, huấn luyện quân sự, các hình ảnh chống phá Đảng và Nhà nước.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowDisclaimer(false)}
                className="w-full mt-6 py-3 rounded-xl font-bold text-white shadow-lg hover:opacity-90 active:scale-95 transition-all"
                style={buttonStyle}
              >
                TÔI ĐÃ HIỂU VÀ ĐỒNG Ý
              </button>
           </div>
        </div>
      )}

      <header className="px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20 transition-colors" style={themeStyle}>
        <div>
          <h2 className="font-bold text-white text-lg tracking-wide uppercase">{systemConfig.appName}</h2>
          <div className="flex items-center text-white/80 text-xs mt-0.5">
            <span className="bg-white/20 px-1.5 py-0.5 rounded mr-2 truncate max-w-[120px]">{user.unit.split('/').pop()}</span>
            <span>{user.displayName}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 text-white/70 hover:text-white transition-colors bg-black/10 rounded-lg">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 scroll-smooth bg-slate-50">
        <input type="file" accept="*/*" capture="environment" ref={cameraInputRef} onChange={handleFileSelection} className="hidden" />
        <input type="file" multiple accept="*/*" ref={multiFileInputRef} onChange={handleFileSelection} className="hidden" />
        <input type="file" 
          // @ts-ignore
          webkitdirectory="" directory="" ref={folderInputRef} onChange={handleFileSelection} className="hidden" />

        {currentView === 'camera' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold mb-2" style={textThemeStyle}>Upload Tài liệu/Đa phương tiện</h3>
              <p className="text-slate-500 text-sm mb-4">
                Lưu trữ: <code className="bg-slate-100 px-1 rounded text-xs">.../{user.username}/T{(new Date().getMonth() + 1).toString().padStart(2, '0')}</code>
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => cameraInputRef.current?.click()} 
                  className="w-full text-white py-4 rounded-xl font-bold flex items-center justify-center text-lg hover:opacity-90 active:scale-95 transition-all shadow-lg"
                  style={buttonStyle}
                >
                  <Camera className="w-8 h-8 mr-3" />
                  CHỤP ẢNH
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => multiFileInputRef.current?.click()} className="bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-medium flex flex-col items-center justify-center hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
                    <Files className="w-6 h-6 mb-1 text-blue-600" />
                    <span className="text-xs">Chọn File</span>
                  </button>
                  <button onClick={() => folderInputRef.current?.click()} className="bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-medium flex flex-col items-center justify-center hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
                    <FolderUp className="w-6 h-6 mb-1 text-amber-600" />
                    <span className="text-xs">Upload Thư mục</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-8 mb-4 border-b border-slate-200 pb-2">
              <h3 className="font-bold text-slate-700 flex items-center">
                <History className="w-4 h-4 mr-2 text-slate-400" />
                Hoạt động gần đây
              </h3>
              <button onClick={() => setCurrentView('history')} className="text-xs font-bold hover:underline" style={textThemeStyle}>Xem tất cả</button>
            </div>
            {photos.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có dữ liệu.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {photos.slice(0, 3).map((photo) => (
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                    {getPreview(photo)}
                    <div className="ml-4 flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{photo.file.name}</p>
                      <div className="mt-1 flex items-center">
                        {photo.status === UploadStatus.UPLOADING && <span className="text-xs text-blue-600 flex items-center font-medium"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang gửi...</span>}
                        {photo.status === UploadStatus.SUCCESS && <span className="text-xs text-green-600 flex items-center font-medium"><CheckCircle className="w-3 h-3 mr-1" /> Đã gửi xong</span>}
                        {photo.status === UploadStatus.ERROR && <span className="text-xs text-red-500 flex items-center font-medium"><XCircle className="w-3 h-3 mr-1" /> {photo.errorMessage}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'history' && (
          <div className="space-y-4">
             <h3 className="font-bold text-slate-800 text-lg mb-4">Lịch sử gửi file</h3>
             {photos.length === 0 && <p className="text-slate-500 text-center">Trống</p>}
             {photos.map((photo) => (
              <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                 {getPreview(photo)}
                 <div className="ml-3 flex-1 min-w-0">
                   <p className="text-sm font-medium text-slate-800 truncate">{photo.file.name}</p>
                   <div className="flex justify-between items-center mt-1">
                     <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        photo.status === UploadStatus.SUCCESS ? 'bg-green-100 text-green-700' :
                        photo.status === UploadStatus.UPLOADING ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                     }`}>
                       {photo.status === UploadStatus.SUCCESS ? 'THÀNH CÔNG' : photo.status === UploadStatus.UPLOADING ? 'ĐANG GỬI' : 'LỖI'}
                     </span>
                     <span className="text-xs text-slate-400">{photo.timestamp.toLocaleTimeString()}</span>
                   </div>
                 </div>
              </div>
            ))}
          </div>
        )}

        {currentView === 'share' && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-lg flex items-center">
              <Share2 className="w-5 h-5 mr-2" style={textThemeStyle} />
              Chia sẻ dữ liệu
            </h3>
            {/* ...Share Logic (Giữ nguyên) ... */}
            {!currentShareFolder ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">Chọn thư mục tháng để xem và chia sẻ.</p>
                {isLoadingShare ? (
                  <div className="py-8 text-center text-slate-400"><Loader2 className="w-8 h-8 mx-auto animate-spin mb-2" /> Đang tải danh sách...</div>
                ) : shareFolders.length === 0 ? (
                   <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">Chưa có thư mục nào trên Cloud.</div>
                ) : (
                  shareFolders.map(folder => (
                    <div key={folder.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                       <div className="flex items-center cursor-pointer flex-1" onClick={() => openShareFolder(folder.name)}>
                         <Folder className="w-10 h-10 text-amber-400 fill-current mr-3" />
                         <div>
                           <p className="font-bold text-slate-700">{folder.name}</p>
                           <p className="text-xs text-slate-400">Thư mục tháng</p>
                         </div>
                       </div>
                       <button onClick={() => handleCreateLink(folder.name, true)} disabled={sharingItem === folder.name} className="p-2 ml-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                         {sharingItem === folder.name ? <Loader2 className="w-5 h-5 animate-spin" /> : <LinkIcon className="w-5 h-5" />}
                       </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
                <button onClick={() => { setCurrentShareFolder(null); setShareFiles([]); }} className="text-sm font-bold text-slate-500 hover:text-primary-600 flex items-center mb-2">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Quay lại
                </button>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-slate-800 flex items-center"><FolderOpen className="w-5 h-5 text-amber-400 mr-2" /> {currentShareFolder}</h4>
                  <button onClick={() => handleCreateLink(currentShareFolder!, true)} disabled={sharingItem === currentShareFolder} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg flex items-center font-bold shadow-sm active:scale-95">
                     {sharingItem === currentShareFolder ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <LinkIcon className="w-3 h-3 mr-1" />} Share Folder
                  </button>
                </div>
                {isLoadingShare ? <div className="py-8 text-center text-slate-400"><Loader2 className="w-8 h-8 mx-auto animate-spin mb-2" /> Đang tải file...</div> : 
                  shareFiles.length === 0 ? <p className="text-center text-slate-400 py-8">Thư mục trống</p> : 
                  shareFiles.map(file => (
                    <div key={file.id} className="bg-white p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                       <div className="flex items-center min-w-0 flex-1">
                         {getFileIcon(file)}
                         <div className="ml-3 min-w-0">
                           <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                           <p className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                         </div>
                       </div>
                       <button onClick={() => handleCreateLink(file.name, false)} disabled={sharingItem === file.name} className="p-2 ml-2 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-lg">
                         {sharingItem === file.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                       </button>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {currentView === 'settings' && user.role === 'admin' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-800 text-xl flex items-center">
              <Settings className="w-6 h-6 mr-2" style={textThemeStyle} />
              Quản trị hệ thống
            </h3>
            
            {/* SYSTEM UI CONFIGURATION */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h4 className="font-bold text-slate-700 flex items-center mb-4 border-b border-slate-100 pb-2">
                <Palette className="w-4 h-4 mr-2 text-slate-500" />
                Cài đặt giao diện
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tên Ứng dụng</label>
                  <input 
                    className="w-full text-sm p-2 border rounded focus:ring-2 outline-none" 
                    value={tempSysConfig.appName}
                    onChange={e => setTempSysConfig({...tempSysConfig, appName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Logo URL (Ảnh vuông)</label>
                  <div className="flex gap-2">
                    <img src={tempSysConfig.logoUrl} className="w-10 h-10 rounded-lg border object-cover bg-slate-50" />
                    <input 
                      className="w-full text-sm p-2 border rounded focus:ring-2 outline-none" 
                      value={tempSysConfig.logoUrl}
                      onChange={e => setTempSysConfig({...tempSysConfig, logoUrl: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Màu chủ đạo</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="color" 
                      className="w-12 h-10 p-0 border-0 rounded cursor-pointer"
                      value={tempSysConfig.themeColor}
                      onChange={e => setTempSysConfig({...tempSysConfig, themeColor: e.target.value})}
                    />
                    <span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">{tempSysConfig.themeColor}</span>
                  </div>
                </div>
                <button 
                  onClick={handleSaveSystemConfig}
                  disabled={isSavingConfig}
                  className="w-full py-2.5 rounded-lg text-white font-bold text-sm shadow-md flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
                  style={{ backgroundColor: tempSysConfig.themeColor }}
                >
                  {isSavingConfig ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  LƯU CẤU HÌNH GIAO DIỆN
                </button>
              </div>
            </div>

            {/* USER MANAGEMENT (Giữ nguyên logic cũ) */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
               <div className="flex justify-between items-center mb-4">
                 <h4 className="font-bold text-slate-700 flex items-center">
                   <Users className="w-4 h-4 mr-2 text-slate-500" />
                   Danh sách cán bộ
                 </h4>
                 <div className="flex gap-2">
                   <button onClick={handleReloadDB} disabled={isSavingUser} className="text-xs bg-slate-100 text-slate-600 p-2 rounded-lg font-bold flex items-center hover:bg-slate-200">
                     <RefreshCw className={`w-3 h-3 ${isSavingUser ? 'animate-spin' : ''}`} />
                   </button>
                   {!isEditingUser && (
                    <button onClick={() => startEditUser()} className="text-xs text-white px-3 py-2 rounded-lg font-bold flex items-center" style={buttonStyle}>
                      <Plus className="w-3 h-3 mr-1" /> Thêm mới
                    </button>
                   )}
                 </div>
               </div>

               {isEditingUser ? (
                 <form onSubmit={handleSaveUser} className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                    <h5 className="font-bold text-sm mb-3" style={textThemeStyle}>{editingUser.id ? 'Sửa thông tin' : 'Thêm cán bộ mới'}</h5>
                    <div className="space-y-3">
                      <input className="w-full text-sm p-2 border rounded" placeholder="Họ và tên" value={editingUser.displayName || ''} onChange={e => setEditingUser({...editingUser, displayName: e.target.value})} />
                      <input className="w-full text-sm p-2 border rounded" placeholder="Username" value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} />
                      <input className="w-full text-sm p-2 border rounded" placeholder="Password" value={editingUser.password || ''} onChange={e => setEditingUser({...editingUser, password: e.target.value})} />
                      <input className="w-full text-sm p-2 border rounded" placeholder="Đơn vị" list="unit-options" value={editingUser.unit || ''} onChange={e => setEditingUser({...editingUser, unit: e.target.value})} />
                      <datalist id="unit-options">{UNIT_SUGGESTIONS.map((unit, idx) => (<option key={idx} value={unit} />))}</datalist>
                      <div className="flex gap-2 mt-2">
                        <Button type="submit" disabled={isSavingUser} className="py-2 text-sm flex-1" style={buttonStyle}>{isSavingUser ? 'Đang lưu...' : 'Lưu'}</Button>
                        <Button type="button" variant="secondary" className="py-2 text-sm" onClick={() => setIsEditingUser(false)}>Hủy</Button>
                      </div>
                    </div>
                 </form>
               ) : (
                 <div className="space-y-3">
                   {usersList.map(u => (
                     <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                       <div className="overflow-hidden mr-2">
                         <p className="font-bold text-sm text-slate-800 truncate">{u.displayName}</p>
                         <p className="text-xs text-slate-500 truncate">{u.unit.split('/').slice(-2).join('/')} • {u.username}</p>
                       </div>
                       <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => startEditUser(u)} className="p-2 text-blue-500 bg-white rounded shadow-sm hover:bg-blue-50"><Edit className="w-4 h-4" /></button>
                          {u.username !== 'admin' && <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-red-500 bg-white rounded shadow-sm hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-start">
               <Database className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
               <p>Dữ liệu được lưu trữ trực tiếp trên thư mục <code>System</code> trong OneDrive.</p>
            </div>
          </div>
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 flex justify-around items-center py-2 pb-safe absolute bottom-0 w-full z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <TabButton active={currentView === 'camera'} onClick={() => setCurrentView('camera')} icon={<Camera />} label="Upload" color={systemConfig.themeColor} />
        <TabButton active={currentView === 'share'} onClick={() => setCurrentView('share')} icon={<Share2 />} label="Chia sẻ" color={systemConfig.themeColor} />
        <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="Lịch sử" color={systemConfig.themeColor} />
        {user.role === 'admin' && (
          <TabButton active={currentView === 'settings'} onClick={() => setCurrentView('settings')} icon={<Settings />} label="Quản trị" color={systemConfig.themeColor} />
        )}
      </nav>
    </div>
  );
}

const TabButton = ({ active, onClick, icon, label, color }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, color?: string }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full py-1 transition-all duration-200 ${active ? 'scale-105' : 'text-slate-400 hover:text-slate-600'}`} style={active ? { color: color } : {}}>
    <div className={`w-6 h-6 ${active ? 'fill-current' : ''}`}>
      {React.cloneElement(icon as React.ReactElement<any>, { size: 24, strokeWidth: active ? 2.5 : 2 })}
    </div>
    <span className="text-[10px] font-bold mt-1">{label}</span>
  </button>
);
