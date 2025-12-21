import React, { useState, useRef, useEffect } from 'react';
import { User, PhotoRecord, UploadStatus, AppConfig, SystemConfig, CloudItem, SystemStats } from './types';
import { INITIAL_USERS, login } from './services/mockAuth';
import { 
  uploadToOneDrive, fetchUsersFromOneDrive, saveUsersToOneDrive, 
  listUserMonthFolders, listFilesInMonthFolder, createShareLink,
  fetchSystemConfig, saveSystemConfig, DEFAULT_SYSTEM_CONFIG, fetchUserRecentFiles,
  getAccessToken, listPathContents, fetchSystemStats
} from './services/graphService';
import { Button } from './components/Button';
import { Album } from './components/Album';
import { Statistics } from './components/Statistics';
import { 
  Camera, LogOut, Info, Settings, History, CheckCircle, XCircle, 
  Loader2, Image as ImageIcon, Users, Trash2, Plus, Edit,
  FileArchive, Film, FolderUp, Files, File as FileIcon, RefreshCw, Database,
  Share2, Folder, FolderOpen, Link as LinkIcon, ChevronLeft, ChevronRight, Download,
  AlertTriangle, Shield, Palette, Save, UserPlus, Check, UploadCloud, Library, Home,
  BarChart3
} from 'lucide-react';

const APP_VERSION_TEXT = "CNTT/f302 - Version 1.00";

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
  
  // Update: Khởi tạo systemConfig từ LocalStorage nếu có để hiển thị Logo ngay lập tức
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => {
    try {
      const saved = localStorage.getItem('systemConfig');
      return saved ? JSON.parse(saved) : DEFAULT_SYSTEM_CONFIG;
    } catch (e) {
      return DEFAULT_SYSTEM_CONFIG;
    }
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false); // Popup state
  
  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [regData, setRegData] = useState({ username: '', password: '', displayName: '', unit: '' });
  
  // Views: camera, history, gallery, settings
  const [currentView, setCurrentView] = useState<'camera' | 'history' | 'gallery' | 'settings'>('camera');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  
  // User Management State
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [isSavingUser, setIsSavingUser] = useState(false);
  
  // System Config State (For Admin Edit)
  const [tempSysConfig, setTempSysConfig] = useState<SystemConfig>(systemConfig); // Init from state
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Statistics State
  const [stats, setStats] = useState<SystemStats>({ totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Gallery View State (NEW)
  const [galleryBreadcrumbs, setGalleryBreadcrumbs] = useState<{name: string, path: string}[]>([{name: 'Toàn đơn vị', path: ''}]);
  const [galleryItems, setGalleryItems] = useState<CloudItem[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);

  // Share View State (Legacy - keeping for fallback but prioritizing Gallery)
  const [sharingItem, setSharingItem] = useState<string | null>(null); 

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECTS ---
  
  // Splash Screen Effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500); // 1.5 giây để load
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const initData = async () => {
      let activeConfig = { ...config };

      // 1. Check API Availability
      try {
        if (!config.simulateMode) {
          // Attempt to fetch token. If 404, we are in preview/local mode.
          await getAccessToken();
        }
      } catch (e: any) {
         if (e.message === "API_NOT_FOUND" || (e.message && e.message.includes("Invalid API Response"))) {
           console.warn("Backend API not found. Switching to Simulation Mode.");
           activeConfig.simulateMode = true;
           setConfig(prev => ({ ...prev, simulateMode: true }));
         }
      }

      try {
        const [cloudUsers, cloudConfig] = await Promise.all([
          fetchUsersFromOneDrive(activeConfig),
          fetchSystemConfig(activeConfig)
        ]);
        setUsersList(cloudUsers);
        
        // Cập nhật State và lưu vào LocalStorage để lần sau load nhanh hơn
        setSystemConfig(cloudConfig);
        setTempSysConfig(cloudConfig);
        localStorage.setItem('systemConfig', JSON.stringify(cloudConfig));

      } catch (e) {
        console.error("Lỗi khởi tạo data:", e);
      } finally {
        setIsDataLoaded(true);
      }
    };
    initData();
  }, []);

  // Fetch gallery when switching to gallery view
  useEffect(() => {
    if (currentView === 'gallery' && user) {
        // Luôn load root khi vào gallery
        loadGalleryPath("");
        setGalleryBreadcrumbs([{name: 'Thư viện', path: ''}]);
    }
  }, [currentView, user]);

  // Load Stats when Admin opens Settings
  useEffect(() => {
    if (currentView === 'settings' && user?.role === 'admin') {
      const loadStats = async () => {
        setIsStatsLoading(true);
        try {
           const cloudStats = await fetchSystemStats(config);
           setStats({
               totalUsers: usersList.length,
               activeUsers: usersList.filter(u => u.status === 'active' || u.status === undefined).length, // Mặc định là active nếu ko có status
               totalFiles: cloudStats.totalFiles || 0,
               totalStorage: cloudStats.totalStorage || 0
           });
        } catch (e) {
            console.error(e);
        } finally {
            setIsStatsLoading(false);
        }
      };
      loadStats();
    }
  }, [currentView, user, usersList]);

  // --- HANDLERS ---
  const loadRecentPhotos = async (currentUser: User) => {
    setIsHistoryLoading(true);
    try {
      const records = await fetchUserRecentFiles(config, currentUser);
      setPhotos(records);
    } catch (e) {
      console.error("Failed to load recent files", e);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    
    let currentList = usersList;
    if (!isDataLoaded) {
       try {
         const [u, c] = await Promise.all([fetchUsersFromOneDrive(config), fetchSystemConfig(config)]);
         currentList = u;
         setUsersList(u);
         setSystemConfig(c);
         localStorage.setItem('systemConfig', JSON.stringify(c)); // Update Cache
         setIsDataLoaded(true);
       } catch (ex) { console.log("Retry load data failed"); }
    }

    try {
      const loggedUser = await login(username, password, currentList);
      if (loggedUser) {
        if (loggedUser.status === 'pending') {
          setLoginError('Tài khoản đang chờ phê duyệt!');
        } else {
          setUser(loggedUser);
          setCurrentView('camera');
          setShowDisclaimer(true);
          // Tải lại lịch sử file ngay khi login
          loadRecentPhotos(loggedUser);
        }
      } else {
        setLoginError('Tài khoản hoặc mật khẩu không đúng.');
      }
    } catch (err) {
      setLoginError('Lỗi kết nối.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regData.username || !regData.password || !regData.displayName || !regData.unit) {
      alert("Vui lòng điền đầy đủ thông tin!");
      return;
    }

    setIsLoading(true);
    try {
      // Refresh user list first to ensure uniqueness
      const currentList = await fetchUsersFromOneDrive(config);
      setUsersList(currentList);

      if (currentList.some(u => u.username.toLowerCase() === regData.username.toLowerCase())) {
        alert("Tên đăng nhập đã tồn tại!");
        setIsLoading(false);
        return;
      }

      const newUser: User = {
        id: Date.now().toString(),
        username: regData.username,
        password: regData.password,
        displayName: regData.displayName,
        unit: regData.unit,
        role: 'staff',
        status: 'pending' // Mặc định là pending
      };

      const newList = [...currentList, newUser];
      const success = await saveUsersToOneDrive(newList, config);
      
      if (success) {
        setUsersList(newList);
        alert("Đăng ký thành công, vui lòng đăng nhập lại sau 5p hoặc liên hệ CNTT/f302.");
        setIsRegistering(false);
        setRegData({ username: '', password: '', displayName: '', unit: '' });
      } else {
        alert("Lỗi khi gửi yêu cầu đăng ký. Vui lòng thử lại.");
      }

    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setUsername('');
    setPassword('');
    setCurrentView('camera');
    setPhotos([]); // Clear local photos
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
      let finalConfig = { ...tempSysConfig };
      
      const success = await saveSystemConfig(finalConfig, config);
      if (success) {
        setSystemConfig(finalConfig);
        setTempSysConfig(finalConfig);
        localStorage.setItem('systemConfig', JSON.stringify(finalConfig)); // Save cache immediately
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

  const handleApproveUser = async (userToApprove: User) => {
    if(!confirm(`Duyệt tài khoản ${userToApprove.displayName}?`)) return;
    setIsSavingUser(true);
    try {
       const newList = usersList.map(u => u.id === userToApprove.id ? { ...u, status: 'active' } as User : u);
       const success = await saveUsersToOneDrive(newList, config);
       if(success) {
         setUsersList(newList);
       } else {
         alert("Lỗi lưu dữ liệu.");
       }
    } catch(e) {
      console.error(e);
      alert("Lỗi hệ thống.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Giới hạn kích thước file < 1MB để tránh làm nặng config file
    if (file.size > 1024 * 1024) {
      alert("Vui lòng chọn ảnh logo dung lượng nhỏ hơn 1MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setTempSysConfig(prev => ({ ...prev, logoUrl: base64String }));
    };
    reader.readAsDataURL(file);
  };

  // ... Helper Functions ...
  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files) as File[];

    const newRecords: PhotoRecord[] = fileArray.map(file => ({
      id: Date.now().toString() + Math.random().toString(),
      file,
      fileName: file.name,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      status: UploadStatus.UPLOADING,
      timestamp: new Date(),
    }));

    setPhotos(prev => [...newRecords, ...prev]);

    for (const record of newRecords) {
      if (!record.file) continue;
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

  // --- GALLERY HANDLERS ---
  const loadGalleryPath = async (path: string) => {
    if (!user) return;
    setIsGalleryLoading(true);
    try {
        const items = await listPathContents(config, path);
        
        // Lọc thư mục nhạy cảm đối với user thường
        let displayItems = items;
        if (user.role !== 'admin') {
            // Danh sách các folder cần ẩn
            const HIDDEN_FOLDERS = ['system', 'bo_chi_huy', 'quan_tri_vien'];
            displayItems = items.filter(i => !HIDDEN_FOLDERS.includes(i.name.toLowerCase()));
        }

        // Sắp xếp: Folder lên trước, File sau
        const sorted = displayItems.sort((a, b) => {
            if (a.folder && !b.folder) return -1;
            if (!a.folder && b.folder) return 1;
            return a.name.localeCompare(b.name);
        });
        setGalleryItems(sorted);
    } catch(e) {
        console.error(e);
        setGalleryItems([]);
    } finally {
        setIsGalleryLoading(false);
    }
  };

  const handleGalleryClick = (item: CloudItem) => {
    if (item.folder) {
        // Là thư mục -> đi sâu vào
        const newBreadcrumb = { name: item.name, path: item.name };
        
        // Tính toán full relative path
        const currentPathString = galleryBreadcrumbs.map(b => b.path).filter(p => p).join('/');
        const newPathString = currentPathString ? `${currentPathString}/${item.name}` : item.name;

        // Cập nhật breadcrumbs với path ĐẦY ĐỦ thực tế để dễ query
        setGalleryBreadcrumbs(prev => [...prev, { name: item.name, path: item.name }]);
        loadGalleryPath(newPathString);
    }
    // File được xử lý bởi component Album hoặc bỏ qua nếu không phải ảnh
  };

  const handleBreadcrumbClick = (index: number) => {
      const newBreadcrumbs = galleryBreadcrumbs.slice(0, index + 1);
      setGalleryBreadcrumbs(newBreadcrumbs);
      
      const newPathString = newBreadcrumbs.map(b => b.path).filter(p => p).join('/');
      loadGalleryPath(newPathString);
  };

  const handleCreateGalleryLink = async (item: CloudItem) => {
      // Logic share link trong Gallery
      if (!user) return;
      setSharingItem(item.id);
      try {
          // Sử dụng Item ID thay vì Path để tránh lỗi "Item not found"
          const link = await createShareLink(config, item.id);
          await navigator.clipboard.writeText(link);
          alert(`Đã copy link chia sẻ: ${item.name}`);
      } catch(e: any) {
          alert("Lỗi tạo link: " + e.message);
      } finally {
          setSharingItem(null);
      }
  };


  const getFileIcon = (fileName: string, mimeType?: string) => {
    if (mimeType?.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return <ImageIcon className="w-6 h-6 text-emerald-600" />;
    if (mimeType?.startsWith('video/') || fileName.match(/\.(mp4|mov|avi|mkv)$/i)) return <Film className="w-6 h-6 text-blue-600" />;
    if (fileName.match(/\.(zip|rar|7z)$/i)) return <FileArchive className="w-6 h-6 text-amber-600" />;
    return <FileIcon className="w-6 h-6 text-slate-400" />;
  };

  // --- SECURE PHOTO PREVIEW ---
  // Component này sẽ tự động thử tải ảnh, nếu lỗi 401/403 sẽ dùng Token để tải lại
  const PhotoPreview = ({ record }: { record: PhotoRecord }) => {
    const [src, setSrc] = useState<string | undefined>(record.previewUrl);
    const [hasError, setHasError] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    // Reset state khi record thay đổi
    useEffect(() => {
        setSrc(record.previewUrl);
        setHasError(false);
        setIsRetrying(false);
    }, [record.previewUrl]);

    const handleLoadError = async () => {
        // Nếu đã retry hoặc không có URL, đánh dấu lỗi và dừng
        if (isRetrying || !record.previewUrl) {
            setHasError(true);
            return;
        }

        // Bắt đầu retry bằng Token
        setIsRetrying(true);
        try {
            const token = await getAccessToken();
            const res = await fetch(record.previewUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                setSrc(blobUrl);
                // Lưu ý: Blob URL cần được revoke khi unmount để tránh leak memory, 
                // nhưng ở scope nhỏ này tạm thời chấp nhận.
            } else {
                setHasError(true);
            }
        } catch (e) {
            console.error("Secure fetch failed", e);
            setHasError(true);
        }
    };

    if (src && !hasError) {
      return (
        <div className="relative w-16 h-16 flex-shrink-0">
            <img 
              src={src} 
              alt="Preview" 
              className="w-full h-full object-cover rounded-lg bg-slate-100 border border-slate-200"
              onError={handleLoadError}
            />
            {isRetrying && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                </div>
            )}
        </div>
      );
    }
    
    // Fallback Icon
    return (
       <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 flex-shrink-0">
        {getFileIcon(record.fileName)}
      </div>
    );
  };

  // --- USER MANAGEMENT HANDLERS ---
  const handleDeleteUser = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa/từ chối tài khoản này?')) return;
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
        role: 'staff',
        status: 'active' // Admin tạo thì active luôn
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

  // --- FILTERS ---
  // Lọc cho trang Upload (Camera): 7 ngày gần nhất
  const getWeeklyPhotos = () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return photos.filter(p => p.timestamp >= oneWeekAgo);
  };

  // Lọc cho trang History: Toàn bộ (đã fetch theo tháng ở service)
  const getHistoryPhotos = () => {
    return photos;
  };

  // --- RENDER ---
  const themeStyle = { backgroundColor: systemConfig.themeColor };
  const textThemeStyle = { color: systemConfig.themeColor };
  const buttonStyle = { backgroundColor: systemConfig.themeColor };

  // 1. RENDER SPLASH SCREEN
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[100] bg-emerald-50 flex flex-col items-center justify-center animate-out fade-out duration-700 fill-mode-forwards">
         <div className="relative mb-6">
            {/* Ripple Effects */}
            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20 delay-100 duration-1000"></div>
            <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20 delay-300 duration-1000"></div>
            
            {/* Logo Container */}
            <div className="relative w-36 h-36 bg-white rounded-full shadow-2xl p-4 flex items-center justify-center animate-bounce">
              <img 
                  src={systemConfig.logoUrl || "/logo302.svg"} 
                  className="w-full h-full object-contain" 
                  alt="Logo" 
                />
            </div>
         </div>
         <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-bold uppercase tracking-widest text-emerald-700 animate-pulse">{systemConfig.appName}</h1>
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
         </div>
      </div>
    );
  }

  if (!user) {
    // ... Login UI (Giữ nguyên)
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-6 animate-in zoom-in duration-500 ease-out">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full mx-auto">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-full flex items-center justify-center border-4 border-white shadow-md overflow-hidden bg-white p-2">
              <img src={systemConfig.logoUrl || "/logo302.svg"} className="w-full h-full object-contain" alt="Logo" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1 uppercase tracking-tight" style={textThemeStyle}>{systemConfig.appName}</h1>
          <p className="text-center text-slate-500 font-medium mb-6 text-sm">Hệ thống upload hình ảnh quân nhân</p>
          
          {isRegistering ? (
            <form onSubmit={handleRegister} className="space-y-4 animate-in slide-in-from-right duration-300">
              <h3 className="text-center font-bold text-lg text-slate-700">Đăng ký tài khoản mới</h3>
              <input className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 outline-none text-sm" placeholder="Họ và tên hiển thị" value={regData.displayName} onChange={e => setRegData({...regData, displayName: e.target.value})} style={{ '--tw-ring-color': systemConfig.themeColor } as React.CSSProperties} />
              <input className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 outline-none text-sm" placeholder="Đơn vị công tác" list="unit-options-reg" value={regData.unit} onChange={e => setRegData({...regData, unit: e.target.value})} style={{ '--tw-ring-color': systemConfig.themeColor } as React.CSSProperties} />
              <datalist id="unit-options-reg">{UNIT_SUGGESTIONS.map((unit, idx) => (<option key={idx} value={unit} />))}</datalist>
              <input className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 outline-none text-sm" placeholder="Tên đăng nhập" value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} style={{ '--tw-ring-color': systemConfig.themeColor } as React.CSSProperties} />
              <input type="password" className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 outline-none text-sm" placeholder="Mật khẩu" value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} style={{ '--tw-ring-color': systemConfig.themeColor } as React.CSSProperties} />
              
              <button type="submit" className="w-full font-bold shadow-lg text-white py-3 rounded-lg hover:opacity-90 transition-opacity" style={buttonStyle} disabled={isLoading}>
                 {isLoading ? 'Đang gửi yêu cầu...' : 'Gửi đăng ký'}
              </button>
              <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-sm text-slate-500 hover:text-slate-800 py-2">Quay lại đăng nhập</button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4 animate-in slide-in-from-left duration-300">
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
              <div className="pt-2 text-center">
                 <button type="button" onClick={() => setIsRegistering(true)} className="text-sm font-bold hover:underline" style={textThemeStyle}>Đăng ký tài khoản mới</button>
              </div>
            </form>
          )}
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
            <span className="bg-white/20 px-1.5 py-0.5 rounded mr-2 truncate max-w-[120px]">{user.unit.split('/').pop()?.replace('Bo_chi_huy', 'Quan_tri_vien')}</span>
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
                Hoạt động gần đây (Tuần)
              </h3>
              <button onClick={() => setCurrentView('history')} className="text-xs font-bold hover:underline" style={textThemeStyle}>Xem tất cả</button>
            </div>
            {isHistoryLoading ? (
              <div className="text-center py-6 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-1" /> Đang đồng bộ...</div>
            ) : getWeeklyPhotos().length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có dữ liệu trong tuần.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {getWeeklyPhotos().slice(0, 5).map((photo) => (
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                    <PhotoPreview record={photo} />
                    <div className="ml-4 flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{photo.fileName}</p>
                      <div className="mt-1 flex items-center justify-between">
                         <div className="flex items-center">
                            {photo.status === UploadStatus.UPLOADING && <span className="text-xs text-blue-600 flex items-center font-medium"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang gửi...</span>}
                            {photo.status === UploadStatus.SUCCESS && <span className="text-xs text-green-600 flex items-center font-medium"><CheckCircle className="w-3 h-3 mr-1" /> Đã gửi</span>}
                            {photo.status === UploadStatus.ERROR && <span className="text-xs text-red-500 flex items-center font-medium"><XCircle className="w-3 h-3 mr-1" /> {photo.errorMessage}</span>}
                         </div>
                         <span className="text-[10px] text-slate-400">{photo.timestamp.toLocaleDateString('vi-VN')}</span>
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
             <h3 className="font-bold text-slate-800 text-lg mb-4">Lịch sử gửi file (Tháng này)</h3>
             {isHistoryLoading ? (
                 <div className="text-center py-12 text-slate-400"><Loader2 className="w-8 h-8 mx-auto animate-spin mb-2" /> Đang tải lịch sử...</div>
             ) : getHistoryPhotos().length === 0 ? (
                 <p className="text-slate-500 text-center">Trống</p>
             ) : (
                 getHistoryPhotos().map((photo) => (
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                     <PhotoPreview record={photo} />
                     <div className="ml-3 flex-1 min-w-0">
                       <p className="text-sm font-medium text-slate-800 truncate">{photo.fileName}</p>
                       <div className="flex justify-between items-center mt-1">
                         <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            photo.status === UploadStatus.SUCCESS ? 'bg-green-100 text-green-700' :
                            photo.status === UploadStatus.UPLOADING ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'
                         }`}>
                           {photo.status === UploadStatus.SUCCESS ? 'THÀNH CÔNG' : photo.status === UploadStatus.UPLOADING ? 'ĐANG GỬI' : 'LỖI'}
                         </span>
                         <span className="text-xs text-slate-400">{photo.timestamp.toLocaleDateString('vi-VN')} {photo.timestamp.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                       </div>
                     </div>
                  </div>
                ))
             )}
          </div>
        )}

        {/* --- GALLERY VIEW START --- */}
        {currentView === 'gallery' && (
          <div className="space-y-4 h-full flex flex-col">
            <h3 className="font-bold text-slate-800 text-lg flex items-center flex-shrink-0">
              <Library className="w-5 h-5 mr-2" style={textThemeStyle} />
              Thư viện chung
            </h3>
            
            {/* Breadcrumbs */}
            <div className="flex items-center space-x-1 text-sm overflow-x-auto pb-2 flex-shrink-0 scrollbar-hide">
              {galleryBreadcrumbs.map((crumb, idx) => (
                <div key={idx} className="flex items-center flex-shrink-0">
                  {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-400 mx-1" />}
                  <button 
                    onClick={() => handleBreadcrumbClick(idx)}
                    className={`font-medium px-2 py-1 rounded-md transition-colors ${idx === galleryBreadcrumbs.length - 1 ? 'bg-slate-100 text-slate-800 font-bold' : 'text-slate-500 hover:text-emerald-600 hover:bg-slate-50'}`}
                  >
                    {idx === 0 ? <Home className="w-4 h-4" /> : crumb.name}
                  </button>
                </div>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto">
               {isGalleryLoading ? (
                   <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                       <Loader2 className="w-8 h-8 animate-spin mb-2" />
                       <span className="text-xs">Đang tải dữ liệu...</span>
                   </div>
               ) : galleryItems.length === 0 ? (
                   <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                       Thư mục trống
                   </div>
               ) : (
                   <div className="space-y-4">
                       {/* 1. Folder List (Nếu có) */}
                       {galleryItems.filter(i => i.folder).length > 0 && (
                           <div className="space-y-2">
                               {galleryItems.filter(i => i.folder).map(item => (
                                   <div 
                                       key={item.id} 
                                       className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between active:scale-[0.98] transition-transform cursor-pointer"
                                       onClick={() => handleGalleryClick(item)}
                                   >
                                       <div className="flex items-center min-w-0 flex-1">
                                           <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mr-3 flex-shrink-0">
                                                <Folder className="w-6 h-6 text-amber-500 fill-amber-500" />
                                            </div>
                                           <div className="min-w-0">
                                               <p className="font-bold text-slate-700 text-sm truncate">{item.name}</p>
                                               <p className="text-[10px] text-slate-400">
                                                   {item.folder?.childCount} mục • {new Date(item.lastModifiedDateTime).toLocaleDateString()}
                                               </p>
                                           </div>
                                       </div>
                                       <div className="flex items-center">
                                           <button 
                                                onClick={(e) => { e.stopPropagation(); handleCreateGalleryLink(item); }}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                                           >
                                               {sharingItem === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                                           </button>
                                           <ChevronRight className="w-4 h-4 text-slate-300 ml-1" />
                                       </div>
                                   </div>
                               ))}
                           </div>
                       )}

                       {/* 2. Photo Album Grid (Nếu có file) */}
                       {galleryItems.filter(i => i.file).length > 0 && (
                           <div>
                               {galleryItems.filter(i => i.folder).length > 0 && (
                                   <div className="flex items-center gap-2 mb-2 mt-4 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                       <ImageIcon className="w-4 h-4" /> Hình ảnh / Video
                                   </div>
                               )}
                               <Album items={galleryItems.filter(i => i.file)} color={systemConfig.themeColor} />
                           </div>
                       )}
                   </div>
               )}
            </div>
          </div>
        )}
        {/* --- GALLERY VIEW END --- */}

        {currentView === 'settings' && user.role === 'admin' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-800 text-xl flex items-center">
              <Settings className="w-6 h-6 mr-2" style={textThemeStyle} />
              Quản trị hệ thống
            </h3>
            
             {/* STATISTICS DASHBOARD (NEW) */}
             <div>
                <h4 className="font-bold text-slate-700 flex items-center mb-4 pb-2">
                   <BarChart3 className="w-4 h-4 mr-2 text-slate-500" />
                   Thống kê hệ thống
                </h4>
                <Statistics stats={stats} isLoading={isStatsLoading} color={systemConfig.themeColor} />
             </div>

             {/* PENDING APPROVALS LIST */}
             <div className="bg-white p-5 rounded-xl shadow-sm border border-orange-200">
               <h4 className="font-bold text-orange-700 flex items-center mb-4 border-b border-orange-100 pb-2">
                 <UserPlus className="w-4 h-4 mr-2" />
                 Yêu cầu duyệt tài khoản ({usersList.filter(u => u.status === 'pending').length})
               </h4>
               <div className="space-y-3">
                 {usersList.filter(u => u.status === 'pending').length === 0 ? (
                   <p className="text-sm text-slate-400 italic">Không có yêu cầu mới.</p>
                 ) : (
                   usersList.filter(u => u.status === 'pending').map(pendingUser => (
                     <div key={pendingUser.id} className="flex flex-col bg-orange-50 p-3 rounded-lg border border-orange-100">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                             <p className="font-bold text-slate-800 text-sm">{pendingUser.displayName}</p>
                             <p className="text-xs text-slate-500">{pendingUser.username} • {pendingUser.unit.split('/').pop()?.replace('Bo_chi_huy', 'Quan_tri_vien')}</p>
                          </div>
                          <span className="bg-orange-200 text-orange-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Pending</span>
                        </div>
                        <div className="flex gap-2 mt-1">
                           <button onClick={() => handleApproveUser(pendingUser)} disabled={isSavingUser} className="flex-1 bg-green-600 text-white py-1.5 rounded text-xs font-bold hover:bg-green-700 flex items-center justify-center">
                             {isSavingUser ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} DUYỆT
                           </button>
                           <button onClick={() => handleDeleteUser(pendingUser.id)} disabled={isSavingUser} className="flex-1 bg-white border border-red-200 text-red-600 py-1.5 rounded text-xs font-bold hover:bg-red-50">
                             TỪ CHỐI
                           </button>
                        </div>
                     </div>
                   ))
                 )}
               </div>
             </div>

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
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Logo Ứng dụng</label>
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-16 rounded-lg border bg-slate-50 overflow-hidden flex-shrink-0 p-2">
                      {/* Logo Preview in Settings */}
                      <img 
                        src={tempSysConfig.logoUrl || "/logo302.svg"} 
                        className="w-full h-full object-contain" 
                        alt="Preview" 
                        onError={(e) => { (e.target as HTMLImageElement).src = "/logo302.svg"; }} 
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-700">Tải lên Logo mới</p>
                      <input 
                        type="file" 
                        accept="image/*"
                        ref={logoInputRef}
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <button 
                        onClick={() => logoInputRef.current?.click()}
                        className="mt-2 text-xs bg-slate-100 text-slate-700 px-3 py-2 rounded-lg font-bold border border-slate-200 hover:bg-slate-200 flex items-center"
                      >
                         <UploadCloud className="w-3 h-3 mr-1" /> Chọn file ảnh
                      </button>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Hỗ trợ: PNG, JPG (Max 1MB).
                      </p>
                    </div>
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
                   Danh sách cán bộ (Active)
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
                   {usersList.filter(u => u.status !== 'pending').map(u => (
                     <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                       <div className="overflow-hidden mr-2">
                         <p className="font-bold text-sm text-slate-800 truncate">{u.displayName}</p>
                         <p className="text-xs text-slate-500 truncate">{u.unit.split('/').slice(-2).join('/').replace('Bo_chi_huy', 'Quan_tri_vien')} • {u.username}</p>
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
          </div>
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 flex justify-around items-center py-2 pb-safe absolute bottom-0 w-full z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <TabButton active={currentView === 'camera'} onClick={() => setCurrentView('camera')} icon={<Camera />} label="Upload" color={systemConfig.themeColor} />
        <TabButton active={currentView === 'gallery'} onClick={() => setCurrentView('gallery')} icon={<Library />} label="Thư viện" color={systemConfig.themeColor} />
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