
import React, { useState, useRef, useEffect } from 'react';
import { User, PhotoRecord, UploadStatus, AppConfig, SystemConfig, CloudItem, SystemStats } from './types';
import { INITIAL_USERS, login } from './services/mockAuth';
import { 
  uploadToOneDrive, fetchUsersFromOneDrive, saveUsersToOneDrive, 
  listUserMonthFolders, listFilesInMonthFolder, createShareLink,
  fetchSystemConfig, saveSystemConfig, DEFAULT_SYSTEM_CONFIG, fetchUserRecentFiles, fetchUserDeletedItems,
  getAccessToken, listPathContents, fetchSystemStats, fetchAllMedia, deleteFileFromOneDrive,
  renameOneDriveItem, aggregateUserStats
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
  BarChart3, Grid, Pencil, Eye, EyeOff, Lock, CheckSquare, Square, Calculator, Clock
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
  
  // Views: camera, history, gallery, settings, user-manager
  const [currentView, setCurrentView] = useState<'camera' | 'history' | 'gallery' | 'settings' | 'user-manager'>('camera');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [deletedPhotos, setDeletedPhotos] = useState<PhotoRecord[]>([]); // New: Deleted Items
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<'uploads' | 'deleted'>('uploads'); // History Tabs
  
  // User Management State
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userFilter, setUserFilter] = useState(''); // Filter cho danh sách cán bộ
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  
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
  const [isViewingAll, setIsViewingAll] = useState(false); // New state to track "View All" mode
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set()); // Chọn nhiều

  // Share View State (Legacy - keeping for fallback but prioritizing Gallery)
  const [sharingItem, setSharingItem] = useState<string | null>(null); 
  const [downloadingFolderId, setDownloadingFolderId] = useState<string | null>(null);
  
  // Action State
  const [isRenaming, setIsRenaming] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // --- HELPER CONSTANT FOR GUEST ---
  // Kiểm tra nếu là user thannhan thì coi là guest
  const isGuest = user?.username === 'thannhan';

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
        setIsViewingAll(false);
        loadGalleryPath("");
        setGalleryBreadcrumbs([{name: 'Thư viện', path: ''}]);
        setSelectedGalleryIds(new Set()); // Reset selection
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
      // Load Uploads (2 Months)
      const uploads = await fetchUserRecentFiles(config, currentUser);
      setPhotos(uploads);
      
      // Load Deleted (Recycle Bin)
      const deleted = await fetchUserDeletedItems(config, currentUser);
      setDeletedPhotos(deleted);
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
          // Nếu là thannhan (guest) thì vào thẳng gallery
          if (loggedUser.username === 'thannhan') {
             setCurrentView('gallery');
             setShowDisclaimer(false); // Guest có thể bỏ qua hoặc giữ tùy ý, ở đây mình tắt cho gọn
          } else {
             setCurrentView('camera');
             setShowDisclaimer(true);
             // Tải lại lịch sử file ngay khi login
             loadRecentPhotos(loggedUser);
          }
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
       const saveSuccess = await saveUsersToOneDrive(newList, config);
       if(saveSuccess) {
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
      progress: 0 // Initialize progress
    }));

    setPhotos(prev => [...newRecords, ...prev]);

    for (const record of newRecords) {
      if (!record.file) continue;
      try {
        const result = await uploadToOneDrive(record.file, config, user, (progress) => {
            // Update progress state
            setPhotos(prev => prev.map(p => 
                p.id === record.id ? { ...p, progress } : p
            ));
        });

        setPhotos(prev => prev.map(p => {
          if (p.id === record.id) {
            return {
              ...p,
              status: result.success ? UploadStatus.SUCCESS : UploadStatus.ERROR,
              uploadedUrl: result.url,
              errorMessage: result.error,
              progress: 100 // Ensure 100% on completion
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
              errorMessage: error.message || "Lỗi không xác định",
              progress: 0
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
        // Updated to pass 'user' to handle allowedPaths
        const items = await listPathContents(config, path, user);
        
        let displayItems = items;
        // Logic lọc phía client (để UI clean hơn, logic chính đã nằm ở graphService)
        if (user.role !== 'admin') {
            // Đảm bảo không hiện file hệ thống
            displayItems = displayItems.filter(i => !['system', 'bo_chi_huy'].includes(i.name.toLowerCase()));
        }

        // Sắp xếp: Folder lên trước, File sau
        const sorted = displayItems.sort((a, b) => {
            if (a.folder && !b.folder) return -1;
            if (!a.folder && b.folder) return 1;
            return a.name.localeCompare(b.name);
        });
        setGalleryItems(sorted);
        setSelectedGalleryIds(new Set()); // Reset selection when changing folder
    } catch(e) {
        console.error(e);
        setGalleryItems([]);
    } finally {
        setIsGalleryLoading(false);
    }
  };

  // New function to handle "View All"
  const handleViewAll = async () => {
     if(!user) return;
     setIsGalleryLoading(true);
     setIsViewingAll(true);
     // Cập nhật Breadcrumb: Home > Tất cả
     setGalleryBreadcrumbs([
         {name: 'Thư viện', path: ''}, 
         {name: 'Tất cả ảnh/video', path: 'ALL_MEDIA_SPECIAL_KEY'}
     ]);
     try {
         const items = await fetchAllMedia(config, user);
         // Sort by Date Descending (Newest first)
         const sorted = items.sort((a,b) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime());
         setGalleryItems(sorted);
         setSelectedGalleryIds(new Set());
     } catch(e) {
         console.error(e);
         setGalleryItems([]);
     } finally {
         setIsGalleryLoading(false);
     }
  };

  const handleGalleryClick = (item: CloudItem) => {
    if (selectedGalleryIds.size > 0) {
        // Nếu đang ở chế độ chọn, click vào folder cũng tính là chọn folder đó
        handleToggleGallerySelect(item.id);
        return;
    }

    if (item.folder) {
        // Là thư mục -> đi sâu vào
        const newBreadcrumb = { name: item.name, path: item.name };
        
        // Tính toán full relative path
        const currentPathString = galleryBreadcrumbs.map(b => b.path).filter(p => p && p !== 'ALL_MEDIA_SPECIAL_KEY').join('/');
        const newPathString = currentPathString ? `${currentPathString}/${item.name}` : item.name;

        // Cập nhật breadcrumbs với path ĐẦY ĐỦ thực tế để dễ query
        setGalleryBreadcrumbs(prev => [...prev, { name: item.name, path: item.name }]);
        loadGalleryPath(newPathString);
    }
    // File được xử lý bởi component Album hoặc bỏ qua nếu không phải ảnh
  };

  const handleToggleGallerySelect = (id: string) => {
      const newSet = new Set(selectedGalleryIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedGalleryIds(newSet);
  };

  const handleBulkDownload = async () => {
      const itemsToDownload = galleryItems.filter(i => selectedGalleryIds.has(i.id));
      if (itemsToDownload.length === 0) return;

      if (!confirm(`Bạn có muốn tải xuống ${itemsToDownload.length} mục đã chọn?`)) return;

      // Logic tải từng file (chỉ hỗ trợ file, folder bỏ qua hoặc cảnh báo)
      let count = 0;
      for (const item of itemsToDownload) {
          if (item.folder) {
              console.warn("Chưa hỗ trợ tải bulk folder:", item.name);
              continue;
          }
          const targetUrl = item.downloadUrl || item.webUrl;
          try {
              const a = document.createElement('a');
              a.href = targetUrl;
              a.download = item.name; // Gợi ý tên file
              // Với link Azure trực tiếp, download attribute có thể không hoạt động nếu cross-origin, 
              // nhưng browser thường tự xử lý header content-disposition
              a.target = '_blank';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              count++;
          } catch(e) { console.error(e); }
          await new Promise(r => setTimeout(r, 500)); // Delay nhẹ
      }
      if (count > 0) setSelectedGalleryIds(new Set()); // Clear selection
  };

  const handleBulkDelete = async () => {
      const itemsToDelete = galleryItems.filter(i => selectedGalleryIds.has(i.id));
      if (itemsToDelete.length === 0) return;

      // Check quyền
      const canDeleteAll = itemsToDelete.every(item => 
          user?.role === 'admin' || item.name.startsWith(user!.username + '_')
      );

      if (!canDeleteAll) {
          alert("Bạn chỉ được phép xóa các file do mình tải lên!");
          return;
      }

      if (!confirm(`CẢNH BÁO: Xóa vĩnh viễn ${itemsToDelete.length} mục đã chọn?`)) return;

      setIsGalleryLoading(true); // Show loading state
      let successCount = 0;
      for (const item of itemsToDelete) {
          try {
              await deleteFileFromOneDrive(config, item.id);
              successCount++;
          } catch(e) { console.error(e); }
      }
      
      alert(`Đã xóa ${successCount}/${itemsToDelete.length} mục.`);
      
      // Refresh list
      setGalleryItems(prev => prev.filter(i => !selectedGalleryIds.has(i.id)));
      setSelectedGalleryIds(new Set());
      setIsGalleryLoading(false);
  };

  // Bulk Toggle Visibility (Public/Hidden) - Admin only
  const handleBulkToggleVisibility = async () => {
      if (user?.role !== 'admin') return;
      const itemsToToggle = galleryItems.filter(i => selectedGalleryIds.has(i.id));
      if (itemsToToggle.length === 0) return;

      if (!confirm(`Bạn có muốn thay đổi trạng thái hiển thị cho ${itemsToToggle.length} mục đã chọn?`)) return;

      setIsGalleryLoading(true);
      let count = 0;
      for (const item of itemsToToggle) {
          // Toggle logic: If starts with PUBLIC_, remove it. If not, add it.
          const isPublic = item.name.startsWith('PUBLIC_');
          const newName = isPublic ? item.name.replace('PUBLIC_', '') : `PUBLIC_${item.name}`;
          
          try {
              const res = await renameOneDriveItem(config, item.id, newName);
              if (res.success) count++;
          } catch(e) { console.error(e); }
          // Delay to prevent rate limiting
          await new Promise(r => setTimeout(r, 200));
      }

      alert(`Đã cập nhật trạng thái ${count}/${itemsToToggle.length} mục.`);
      
      // Refresh current folder
      const currentPath = galleryBreadcrumbs.map(b => b.path).filter(p => p && p !== 'ALL_MEDIA_SPECIAL_KEY').join('/');
      loadGalleryPath(currentPath);
      setSelectedGalleryIds(new Set()); // Clear selection
  };


  const handleBreadcrumbClick = (index: number) => {
      const targetCrumb = galleryBreadcrumbs[index];

      // Nếu đang ở chế độ xem tất cả
      if (isViewingAll) {
          // Nếu click vào chính mục "Tất cả ảnh/video" -> không làm gì
          if (targetCrumb.path === 'ALL_MEDIA_SPECIAL_KEY') return;
          
          // Nếu click vào Home hoặc mục khác -> Thoát chế độ View All và quay về mục đó
          setIsViewingAll(false);
      }

      const newBreadcrumbs = galleryBreadcrumbs.slice(0, index + 1);
      setGalleryBreadcrumbs(newBreadcrumbs);
      
      const newPathString = newBreadcrumbs.map(b => b.path).filter(p => p && p !== 'ALL_MEDIA_SPECIAL_KEY').join('/');
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

  const handleRenameFolder = async (item: CloudItem) => {
    if (!user || user.role !== 'admin') return;
    
    const newName = prompt(`Nhập tên mới cho "${item.name}":`, item.name);
    
    if (!newName || newName.trim() === "" || newName === item.name) return;

    try {
        const result = await renameOneDriveItem(config, item.id, newName.trim());
        
        if (result.success) {
            alert("Đổi tên thành công!");
            // Cập nhật state local để UI phản hồi ngay lập tức
            setGalleryItems(prev => prev.map(i => i.id === item.id ? { ...i, name: newName.trim() } : i));
        } else {
            alert("Lỗi: " + result.error);
        }
    } catch (e) {
        alert("Có lỗi xảy ra khi đổi tên.");
    }
  };

  // ADMIN: Toggle Visibility (Public/Private)
  const handleToggleVisibility = async (item: CloudItem) => {
    if (!user || user.role !== 'admin') return;
    
    const isPublic = item.name.startsWith('PUBLIC_');
    const newName = isPublic ? item.name.replace('PUBLIC_', '') : `PUBLIC_${item.name}`;
    
    setIsRenaming(item.id);
    try {
         const result = await renameOneDriveItem(config, item.id, newName);
         if (result.success) {
             // Update local state
             setGalleryItems(prev => prev.map(i => i.id === item.id ? { ...i, name: newName } : i));
         } else {
             alert("Lỗi đổi trạng thái: " + result.error);
         }
    } catch(e) {
         console.error(e);
         alert("Lỗi kết nối");
    } finally {
         setIsRenaming(null);
    }
  };

  const handleDeleteFolder = async (item: CloudItem) => {
    if (!user || user.role !== 'admin') return;
    
    // Cảnh báo mạnh cho việc xóa thư mục
    const confirmMsg = `CẢNH BÁO: Bạn có chắc muốn xóa thư mục "${item.name}"?\nToàn bộ dữ liệu bên trong sẽ bị xóa vĩnh viễn và không thể khôi phục!`;
    if (!confirm(confirmMsg)) return;

    try {
        const success = await deleteFileFromOneDrive(config, item.id);
        
        if (success) {
            alert(`Đã xóa thư mục ${item.name}`);
            // Cập nhật UI: Loại bỏ item đã xóa khỏi danh sách hiện tại
            setGalleryItems(prev => prev.filter(i => i.id !== item.id));
        } else {
            alert("Không thể xóa thư mục. Vui lòng kiểm tra lại quyền hạn hoặc thử lại sau.");
        }
    } catch (e) {
        alert("Lỗi hệ thống khi xóa thư mục.");
    }
  };

  const handleDownloadFolder = async (item: CloudItem) => {
    if (!user) return;
    
    // 1. Xác định đường dẫn thư mục
    const currentPath = galleryBreadcrumbs.map(b => b.path).filter(p => p && p !== 'ALL_MEDIA_SPECIAL_KEY').join('/');
    const folderPath = currentPath ? `${currentPath}/${item.name}` : item.name;

    setDownloadingFolderId(item.id);
    
    try {
        // 2. Lấy danh sách file trong thư mục (Lấy cả subfolders nhưng chỉ tải file ở level 1 cho an toàn)
        // Lưu ý: Nếu muốn tải sâu (recursive), cần logic phức tạp hơn. Ở đây hỗ trợ tải các file trực tiếp trong folder.
        const items = await listPathContents(config, folderPath);
        const files = items.filter(i => i.file);

        if (files.length === 0) {
            alert("Thư mục trống hoặc không chứa file trực tiếp.");
            return;
        }
        
        const confirmMsg = `Thư mục có ${files.length} file. Bạn có muốn tải xuống lần lượt không?`;
        if (!confirm(confirmMsg)) return;

        // 3. Tải tuần tự
        let successCount = 0;
        for (const file of files) {
            const targetUrl = file.downloadUrl || file.webUrl;
            try {
                // Fetch blob để ép tên file và tránh mở tab
                const res = await fetch(targetUrl);
                if(res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    successCount++;
                }
            } catch (e) {
                console.error(`Lỗi tải file ${file.name}`, e);
            }
            // Delay nhỏ để tránh treo trình duyệt
            await new Promise(resolve => setTimeout(resolve, 800));
        }
        
    } catch (e) {
        console.error(e);
        alert("Có lỗi xảy ra khi tải thư mục.");
    } finally {
        setDownloadingFolderId(null);
    }
  };

  const handleDeleteGalleryItem = async (item: CloudItem) => {
     if(!user) return;

     // Kiểm tra quyền xóa: Admin hoặc Owner
     const isOwner = item.name.startsWith(user.username + '_');
     
     if (user.role !== 'admin' && !isOwner) {
         alert("Bạn chỉ có thể xóa hình ảnh do chính mình tải lên!");
         return;
     }

     try {
         const success = await deleteFileFromOneDrive(config, item.id);
         if (success) {
             alert(`Đã xóa ${item.name}`);
             // Cập nhật UI: Loại bỏ item đã xóa khỏi danh sách hiện tại
             setGalleryItems(prev => prev.filter(i => i.id !== item.id));
         } else {
             alert("Không thể xóa file. Vui lòng thử lại.");
         }
     } catch (e) {
         alert("Lỗi hệ thống khi xóa file.");
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
  const handleCalculateUserStats = async () => {
      if(!user) return;
      setIsCalculatingStats(true);
      try {
          // 1. Fetch toàn bộ media file của hệ thống
          const allMedia = await fetchAllMedia(config, user);
          // 2. Tính toán
          const updatedUsers = aggregateUserStats(allMedia, usersList);
          // 3. Cập nhật state (chỉ local để hiển thị, không nhất thiết save DB nếu không cần persist)
          setUsersList(updatedUsers);
          alert("Đã cập nhật số liệu thống kê từ " + allMedia.length + " files.");
      } catch(e) {
          console.error(e);
          alert("Lỗi tính toán.");
      } finally {
          setIsCalculatingStats(false);
      }
  };

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
        // Cập nhật existing user
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
        status: 'active',
        // allowedPaths removed as per new instruction
        allowedPaths: []
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

  // Filter User List
  const filteredUsers = usersList.filter(u => {
      const term = userFilter.toLowerCase();
      return u.displayName.toLowerCase().includes(term) || 
             u.username.toLowerCase().includes(term) ||
             u.unit.toLowerCase().includes(term);
  });

  // --- FILTERS ---
  // Lọc cho trang Upload (Camera): 7 ngày gần nhất
  const getWeeklyPhotos = () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return photos.filter(p => p.timestamp >= oneWeekAgo);
  };

  // Lọc cho trang History
  const getDisplayHistoryPhotos = () => {
    if (historyTab === 'deleted') {
        return deletedPhotos;
    }
    return photos; // 2 Months Uploads
  };
  
  // Xác định xem có phải đang ở trong thư mục Admin (Quan_tri_vien) hay không để hiện nút Toggle
  // Update logic: Allow toggle inside ANY Public folder or Quan_tri_vien
  const isInAdminFolder = galleryBreadcrumbs.some(b => b.path.toLowerCase().includes('quan_tri_vien') || b.path.startsWith('PUBLIC_'));

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
          <div className="mt-8 text-center text-xs text-slate-400">
            <p>{APP_VERSION_TEXT}</p>
            <p className="mt-1">Developed by Vũ Đăng Hải - Bùi Công Tới</p>
          </div>
        </div>
      </div>
    );
  }

  // SỬA ĐỔI LAYOUT: Dùng h-[100dvh] để cố định chiều cao bằng màn hình, Flexbox column để chia layout
  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {/* Disclaimer Modal */}
      {showDisclaimer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full border-t-4 border-amber-500">
              <div className="flex items-center text-amber-600 mb-3 font-bold text-lg">
                <Shield className="w-6 h-6 mr-2" />
                QUY ĐỊNH BẢO MẬT
              </div>
              <div className="text-slate-700 text-sm space-y-3 leading-relaxed text-justify">
                <p>Đây là cổng thông tin lưu trữ hoạt động của các cơ quan, đơn vị và đời sống của bộ đội Sư đoàn 302.</p>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <p className="font-medium text-amber-800">
                    Vui lòng không đăng tải các hình ảnh có độ mật, "lưu hành nội bộ", như: Sơ đồ vị trí đóng quân, các văn kiện huấn luyện, SSCĐ, diễn tập, văn kiện tác chiến, đội hình, chiến thuật, hình ảnh VKTB chưa được phép công bố, hình ảnh làm ảnh hưởng tới phong cách quân nhân.
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

      {/* HEADER: Flex-none để không bị co giãn */}
      <header className="flex-none px-6 py-4 flex justify-between items-center shadow-lg z-20 transition-colors" style={themeStyle}>
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

      {/* MAIN CONTENT: Flex-1 để chiếm toàn bộ khoảng trống còn lại, overflow-y-auto để cuộn nội dung */}
      <main className="flex-1 overflow-y-auto p-4 scroll-smooth bg-slate-50">
        <input type="file" accept="*/*" capture="environment" ref={cameraInputRef} onChange={handleFileSelection} className="hidden" />
        <input type="file" multiple accept="*/*" ref={multiFileInputRef} onChange={handleFileSelection} className="hidden" />
        <input type="file" 
          // @ts-ignore
          webkitdirectory="" directory="" ref={folderInputRef} onChange={handleFileSelection} className="hidden" />
          
        {currentView === 'camera' && !isGuest && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold mb-2" style={textThemeStyle}>Upload Tài liệu/Đa phương tiện</h3>
              <p className="text-slate-500 text-sm mb-4">
                Lưu trữ: <code className="bg-slate-100 px-1 rounded text-xs">.../{user.username}/T{(new Date().getMonth() + 1).toString().padStart(2, '0')}/Tuần_{Math.min(4, Math.ceil(new Date().getDate() / 7))}</code>
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
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center flex-wrap">
                    <PhotoPreview record={photo} />
                    <div className="ml-4 flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{photo.fileName}</p>
                      <div className="mt-1 flex items-center justify-between">
                         <div className="flex items-center">
                            {photo.status === UploadStatus.UPLOADING && <span className="text-xs text-blue-600 flex items-center font-medium"><Loader2 className="w-3 h-3 mr-1" /> Đang gửi...</span>}
                            {photo.status === UploadStatus.SUCCESS && <span className="text-xs text-green-600 flex items-center font-medium"><CheckCircle className="w-3 h-3 mr-1" /> Đã gửi</span>}
                            {photo.status === UploadStatus.ERROR && <span className="text-xs text-red-500 flex items-center font-medium"><XCircle className="w-3 h-3 mr-1" /> {photo.errorMessage}</span>}
                         </div>
                         <span className="text-[10px] text-slate-400">{photo.timestamp.toLocaleDateString('vi-VN')}</span>
                      </div>
                      
                      {/* Progress Bar for Uploading Files */}
                      {photo.status === UploadStatus.UPLOADING && photo.progress !== undefined && (
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                            <div 
                                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300 ease-out" 
                                style={{ width: `${photo.progress}%` }}
                            ></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'history' && !isGuest && (
          <div className="space-y-4">
             <h3 className="font-bold text-slate-800 text-lg mb-2">Lịch sử hoạt động</h3>
             
             {/* History Tabs */}
             <div className="flex bg-slate-100 rounded-lg p-1 mb-4">
                 <button 
                    onClick={() => setHistoryTab('uploads')}
                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${historyTab === 'uploads' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                 >
                     Đã tải lên (2 tháng)
                 </button>
                 <button 
                    onClick={() => setHistoryTab('deleted')}
                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${historyTab === 'deleted' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}
                 >
                     Đã xóa
                 </button>
             </div>

             {isHistoryLoading ? (
                 <div className="text-center py-12 text-slate-400"><Loader2 className="w-8 h-8 mx-auto animate-spin mb-2" /> Đang tải lịch sử...</div>
             ) : getDisplayHistoryPhotos().length === 0 ? (
                 <p className="text-slate-500 text-center py-8">Không có dữ liệu.</p>
             ) : (
                 getDisplayHistoryPhotos().map((photo) => (
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                     {/* Show deleted icon if tab deleted */}
                     {historyTab === 'deleted' ? (
                         <div className="w-16 h-16 flex items-center justify-center bg-red-50 rounded-lg border border-red-100 flex-shrink-0">
                             <Trash2 className="w-6 h-6 text-red-400" />
                         </div>
                     ) : (
                         <PhotoPreview record={photo} />
                     )}
                     
                     <div className="ml-3 flex-1 min-w-0">
                       <p className="text-sm font-medium text-slate-800 truncate">{photo.fileName}</p>
                       <div className="flex justify-between items-center mt-1">
                         <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            historyTab === 'deleted' ? 'bg-red-100 text-red-700' :
                            photo.status === UploadStatus.SUCCESS ? 'bg-green-100 text-green-700' :
                            photo.status === UploadStatus.UPLOADING ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'
                         }`}>
                           {historyTab === 'deleted' ? 'ĐÃ XÓA' : 
                            photo.status === UploadStatus.SUCCESS ? 'THÀNH CÔNG' : 
                            photo.status === UploadStatus.UPLOADING ? 'ĐANG GỬI' : 'LỖI'}
                         </span>
                         <span className="text-xs text-slate-400">
                             {historyTab === 'deleted' && photo.deletedDate ? 
                                `Xóa: ${photo.deletedDate.toLocaleDateString('vi-VN')}` : 
                                `${photo.timestamp.toLocaleDateString('vi-VN')} ${photo.timestamp.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}`
                             }
                         </span>
                       </div>
                     </div>
                  </div>
                ))
             )}
          </div>
        )}

        {/* --- GALLERY VIEW START --- */}
        {currentView === 'gallery' && (
          <div className="space-y-4 h-full flex flex-col relative">
            <div className="flex justify-between items-center flex-shrink-0">
                <h3 className="font-bold text-slate-800 text-lg flex items-center">
                  <Library className="w-5 h-5 mr-2" style={textThemeStyle} />
                  Thư viện chung
                </h3>
                {!isViewingAll && (
                    <button 
                        onClick={handleViewAll}
                        className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-bold flex items-center"
                    >
                        <Grid className="w-3 h-3 mr-1" />
                        Xem tất cả
                    </button>
                )}
                {isViewingAll && (
                    <button 
                        onClick={() => handleBreadcrumbClick(0)}
                        className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-bold flex items-center"
                    >
                        <Folder className="w-3 h-3 mr-1" />
                        Theo thư mục
                    </button>
                )}
            </div>
            
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
            <div className="flex-1 overflow-y-auto pb-20">
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
                       {/* 1. Folder List (Nếu có và không ở chế độ Xem tất cả) */}
                       {galleryItems.filter(i => i.folder).length > 0 && (
                           <div className="space-y-2">
                               {galleryItems.filter(i => i.folder).map(item => {
                                   const isSelected = selectedGalleryIds.has(item.id);
                                   return (
                                   <div 
                                       key={item.id} 
                                       className={`bg-white p-3 rounded-xl shadow-sm border flex items-center justify-between active:scale-[0.98] transition-transform cursor-pointer ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100'}`}
                                       onClick={() => handleGalleryClick(item)}
                                   >
                                       <div className="flex items-center min-w-0 flex-1">
                                            {/* CHECKBOX FOLDER */}
                                            <div onClick={(e) => { e.stopPropagation(); handleToggleGallerySelect(item.id); }} className="mr-3 text-slate-400 hover:text-emerald-500">
                                                {isSelected ? <CheckSquare className="w-6 h-6 text-emerald-500" /> : <Square className="w-6 h-6" />}
                                            </div>

                                           <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mr-3 flex-shrink-0">
                                                <Folder className="w-6 h-6 text-amber-500 fill-amber-500" />
                                            </div>
                                           <div className="min-w-0">
                                               <p className="font-bold text-slate-700 text-sm truncate">{item.name.replace('PUBLIC_', '')}</p>
                                               <div className="flex items-center gap-2">
                                                   <p className="text-[10px] text-slate-400">
                                                       {item.folder?.childCount} mục • {new Date(item.lastModifiedDateTime).toLocaleDateString()}
                                                   </p>
                                                   {/* Show Public Label for everyone */}
                                                   {item.name.startsWith('PUBLIC_') && (
                                                       <span className="text-[9px] bg-green-100 text-green-700 px-1.5 rounded font-bold border border-green-200">Công khai</span>
                                                   )}
                                                   {/* Show Lock for Admin if private */}
                                                   {user.role === 'admin' && !item.name.startsWith('PUBLIC_') && isInAdminFolder && (
                                                       <Lock className="w-3 h-3 text-slate-400" />
                                                   )}
                                               </div>
                                           </div>
                                       </div>
                                       <div className="flex items-center gap-1">
                                           {/* ADMIN Actions */}
                                           {user.role === 'admin' && (
                                                <>
                                                    {/* Toggle Visibility (Only inside Admin/Public Folder) */}
                                                    {isInAdminFolder && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleToggleVisibility(item); }}
                                                            disabled={isRenaming === item.id}
                                                            className={`p-2 rounded-full ${isRenaming === item.id ? 'opacity-50' : ''} ${item.name.startsWith('PUBLIC_') ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                                                            title={item.name.startsWith('PUBLIC_') ? "Đang công khai. Nhấn để ẩn." : "Đang ẩn. Nhấn để công khai."}
                                                        >
                                                            {isRenaming === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : item.name.startsWith('PUBLIC_') ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                        </button>
                                                    )}

                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleRenameFolder(item); }}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                                                        title="Đổi tên"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                </>
                                           )}
                                           <ChevronRight className="w-4 h-4 text-slate-300 ml-1" />
                                       </div>
                                   </div>
                                   );
                               })}
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
                               <Album 
                                  items={galleryItems.filter(i => i.file)} 
                                  color={systemConfig.themeColor}
                                  isAdmin={user.role === 'admin'}
                                  currentUser={user} // Truyền user hiện tại
                                  onDelete={handleDeleteGalleryItem}
                                  isSelectionMode={true}
                                  selectedIds={selectedGalleryIds}
                                  onToggleSelect={handleToggleGallerySelect}
                               />
                           </div>
                       )}
                   </div>
               )}
            </div>
            
            {/* FLOATING ACTION BAR FOR SELECTION */}
            {selectedGalleryIds.size > 0 && (
                <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 flex justify-between items-center z-50 animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center">
                        <div className="bg-emerald-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mr-3">
                            {selectedGalleryIds.size}
                        </div>
                        <span className="text-sm font-medium text-slate-700">Đã chọn</span>
                    </div>
                    <div className="flex gap-2">
                         {/* ADMIN ONLY: Public/Hidden Button - Only show if in a context where toggling makes sense */}
                         {user.role === 'admin' && isInAdminFolder && (
                             <button 
                                onClick={handleBulkToggleVisibility} 
                                className="bg-amber-50 text-amber-600 px-3 py-2 rounded-lg font-bold text-xs flex items-center hover:bg-amber-100"
                                title="Bật/Tắt hiển thị công khai"
                             >
                                <Eye className="w-4 h-4" />
                             </button>
                         )}

                         <button 
                            onClick={handleBulkDownload} 
                            className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold text-xs flex items-center hover:bg-blue-100"
                         >
                            <Download className="w-4 h-4 mr-1" /> Tải về
                         </button>
                         <button 
                            onClick={handleBulkDelete} 
                            className="bg-red-50 text-red-600 px-3 py-2 rounded-lg font-bold text-xs flex items-center hover:bg-red-100"
                         >
                            <Trash2 className="w-4 h-4 mr-1" /> Xóa
                         </button>
                         <button 
                            onClick={() => setSelectedGalleryIds(new Set())}
                            className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200"
                         >
                            <XCircle className="w-5 h-5" />
                         </button>
                    </div>
                </div>
            )}
          </div>
        )}
        {/* --- GALLERY VIEW END --- */}

        {currentView === 'settings' && user.role === 'admin' && !isGuest && (
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

             {/* NAVIGATION TO USER MANAGER */}
             <button 
                onClick={() => setCurrentView('user-manager')}
                className="w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between hover:bg-slate-50 transition-colors group"
             >
                <div className="flex items-center">
                   <div className="bg-indigo-50 p-3 rounded-lg mr-4">
                      <Users className="w-6 h-6 text-indigo-600" />
                   </div>
                   <div className="text-left">
                      <h4 className="font-bold text-slate-800">Danh sách Cán bộ</h4>
                      <p className="text-sm text-slate-500">Quản lý tài khoản, mật khẩu & thống kê sử dụng</p>
                   </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" />
             </button>

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
          </div>
        )}

        {currentView === 'user-manager' && user.role === 'admin' && (
           <div className="space-y-4">
               {/* Header Navigation */}
               <div className="flex items-center mb-4">
                   <button onClick={() => setCurrentView('settings')} className="mr-3 p-2 rounded-full hover:bg-slate-100">
                       <ChevronLeft className="w-6 h-6 text-slate-600" />
                   </button>
                   <h3 className="font-bold text-slate-800 text-xl">Quản lý cán bộ</h3>
               </div>

               {/* Stats Action */}
               <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center justify-between">
                   <div>
                       <p className="font-bold text-indigo-900 text-sm">Thống kê sử dụng</p>
                       <p className="text-xs text-indigo-600">Quét toàn bộ hệ thống để đếm file/dung lượng từng user.</p>
                   </div>
                   <button 
                      onClick={handleCalculateUserStats}
                      disabled={isCalculatingStats}
                      className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center hover:bg-indigo-700"
                   >
                       {isCalculatingStats ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Calculator className="w-4 h-4 mr-1" />}
                       Tính toán
                   </button>
               </div>
               
               {/* Search & Filter */}
               <div className="relative">
                   <input 
                      type="text" 
                      placeholder="Tìm kiếm theo tên, đơn vị..." 
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                   />
                   <div className="absolute left-3 top-3.5 text-slate-400">
                       <Users className="w-5 h-5" />
                   </div>
               </div>

               {/* Action Bar */}
               <div className="flex justify-between items-center">
                 <div className="flex gap-2">
                   <button onClick={handleReloadDB} disabled={isSavingUser} className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg font-bold flex items-center hover:bg-slate-200">
                     <RefreshCw className={`w-3 h-3 mr-1 ${isSavingUser ? 'animate-spin' : ''}`} /> Tải lại
                   </button>
                   {!isEditingUser && (
                    <button onClick={() => startEditUser()} className="text-xs text-white px-3 py-2 rounded-lg font-bold flex items-center" style={buttonStyle}>
                      <Plus className="w-3 h-3 mr-1" /> Thêm mới
                    </button>
                   )}
                 </div>
                 <span className="text-xs font-bold text-slate-500">Tổng: {filteredUsers.length}</span>
               </div>

               {/* Edit Form */}
               {isEditingUser && (
                 <form onSubmit={handleSaveUser} className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4 animate-in slide-in-from-top duration-300">
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
               )}
               
               {/* User List Table */}
               <div className="space-y-3">
                   {filteredUsers.length === 0 ? (
                       <p className="text-center text-slate-400 py-8">Không tìm thấy kết quả.</p>
                   ) : (
                       filteredUsers.filter(u => u.status !== 'pending').map(u => (
                         <div key={u.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                             <div className="p-3 flex items-start justify-between">
                                 <div className="flex-1 min-w-0 pr-2">
                                     <div className="flex items-center">
                                         <p className="font-bold text-slate-800 truncate">{u.displayName}</p>
                                         {u.role === 'admin' && <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1.5 rounded font-bold">ADMIN</span>}
                                     </div>
                                     <p className="text-xs text-slate-500 truncate mt-0.5">{u.unit.split('/').slice(-1)[0].replace('Bo_chi_huy', 'Quan_tri_vien')}</p>
                                     <p className="text-xs text-slate-400 font-mono mt-0.5">{u.username}</p>
                                 </div>
                                 <div className="flex flex-col items-end gap-2">
                                    <div className="flex gap-1">
                                      <button onClick={() => startEditUser(u)} className="p-1.5 text-blue-500 bg-blue-50 rounded hover:bg-blue-100"><Edit className="w-4 h-4" /></button>
                                      {u.username !== 'admin' && <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 text-red-500 bg-red-50 rounded hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>}
                                    </div>
                                 </div>
                             </div>
                             {/* Usage Stats Bar */}
                             <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex justify-between text-xs text-slate-600">
                                 <div className="flex items-center" title="Tổng số file">
                                     <Files className="w-3 h-3 mr-1 text-slate-400" /> 
                                     {u.usageStats ? u.usageStats.fileCount : '-'} file
                                 </div>
                                 <div className="flex items-center" title="Tổng dung lượng">
                                     <Database className="w-3 h-3 mr-1 text-slate-400" />
                                     {u.usageStats ? (u.usageStats.totalSize / 1024 / 1024).toFixed(1) : '-'} MB
                                 </div>
                             </div>
                         </div>
                       ))
                   )}
               </div>
           </div>
        )}
      </main>

      {/* FOOTER NAV: Bỏ absolute để trở thành 1 phần tử flex-none ở cuối cột, đảm bảo luôn nằm dưới cùng màn hình */}
      <nav className="bg-white border-t border-slate-200 flex justify-around items-center py-2 pb-safe flex-none shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
        {!isGuest && (
            <TabButton active={currentView === 'camera'} onClick={() => setCurrentView('camera')} icon={<Camera />} label="Upload" color={systemConfig.themeColor} />
        )}
        <TabButton active={currentView === 'gallery'} onClick={() => setCurrentView('gallery')} icon={<Library />} label="Thư viện" color={systemConfig.themeColor} />
        {!isGuest && (
            <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="Lịch sử" color={systemConfig.themeColor} />
        )}
        {user.role === 'admin' && !isGuest && (
          <TabButton active={['settings', 'user-manager'].includes(currentView)} onClick={() => setCurrentView('settings')} icon={<Settings />} label="Quản trị" color={systemConfig.themeColor} />
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
