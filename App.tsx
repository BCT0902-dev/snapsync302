// BCT0902
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  fetchSystemConfig, saveSystemConfig, DEFAULT_SYSTEM_CONFIG, fetchUserRecentFiles, fetchUserDeletedItems,
  getAccessToken, listPathContents, fetchSystemStats, fetchAllMedia, deleteFileFromOneDrive,
  renameOneDriveItem, aggregateUserStats, moveOneDriveItem, fetchFolderChildren,
  fetchQRCodeLogs, saveQRCodeLog, deleteQRCodeLog, fetchUsersFromOneDrive, saveUsersToOneDrive,
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
  Camera, LogOut, Info, Settings, History, CheckCircle, XCircle, 
  Loader2, Image as ImageIcon, Users, Trash2, Plus, Edit,
  FileArchive, Film, FolderUp, Files, File as FileIcon, RefreshCw, Database,
  Share2, Folder, FolderOpen, Link as LinkIcon, ChevronLeft, ChevronRight, Download,
  AlertTriangle, Shield, Palette, Save, UserPlus, Check, UploadCloud, Library, Home,
  BarChart3, Grid, Pencil, Eye, EyeOff, Lock, CheckSquare, Square, Calculator, Clock, Globe,
  FolderLock, ChevronDown, QrCode, ExternalLink, HeartHandshake, AlertCircle, User as UserIcon, PlayCircle,
  Monitor
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

interface ExtendedCloudItem extends CloudItem {
  level: number;
  expanded?: boolean;
  isLoadingChildren?: boolean;
  hasLoadedChildren?: boolean;
}

const TabButton = ({ active, onClick, icon, label, color }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, color?: string }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full py-1 transition-all duration-200 ${active ? 'scale-105' : 'text-slate-400 hover:text-slate-600'}`} style={active ? { color: color } : {}}>
    <div className={`w-6 h-6 ${active ? 'fill-current' : ''}`}>
      {React.cloneElement(icon as React.ReactElement<any>, { size: 24, strokeWidth: active ? 2.5 : 2 })}
    </div>
    <span className="text-[10px] font-bold mt-1">{label}</span>
  </button>
);

// --- SHARED FILE VIEWER (Dành cho khách quét QR) ---
const SharedFileViewer = ({ fileId, systemConfig }: { fileId: string, systemConfig: SystemConfig }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fileData, setFileData] = useState<{name: string, url: string, mimeType: string, size: number, downloadUrl?: string} | null>(null);
    const [pdfViewMode, setPdfViewMode] = useState<'google' | 'native'>('google'); // 'google' is better for mobile

    useEffect(() => {
        const loadFile = async () => {
            try {
                // Lấy Access Token (Service Token)
                const token = await getAccessToken();
                
                // 1. Lấy thông tin file (Metadata) - Lấy thêm @microsoft.graph.downloadUrl
                const metaUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?select=id,name,file,size,@microsoft.graph.downloadUrl`;
                const metaRes = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                
                if (!metaRes.ok) {
                    if (metaRes.status === 404) throw new Error("File không tồn tại hoặc đã bị xóa.");
                    throw new Error("Không thể kết nối đến hệ thống lưu trữ.");
                }
                const meta = await metaRes.json();
                const fileName = meta.name;

                // 2. Lấy nội dung file (Binary Content) - Vẫn giữ để làm nút Download và làm fallback
                const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`;
                const contentRes = await fetch(contentUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                
                if (!contentRes.ok) throw new Error("Lỗi tải nội dung file.");

                let blob = await contentRes.blob();
                
                // --- LOGIC QUAN TRỌNG: ÉP KIỂU MIME TYPE DỰA TRÊN ĐUÔI FILE ---
                // OneDrive đôi khi trả về 'application/octet-stream' cho ảnh/video/pdf...
                let mimeType = meta.file?.mimeType || 'application/octet-stream';
                
                if (mimeType === 'application/octet-stream' || !mimeType) {
                    const ext = fileName.split('.').pop()?.toLowerCase();
                    if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
                    else if (['png'].includes(ext)) mimeType = 'image/png';
                    else if (['gif'].includes(ext)) mimeType = 'image/gif';
                    else if (['webp'].includes(ext)) mimeType = 'image/webp';
                    else if (['bmp'].includes(ext)) mimeType = 'image/bmp';
                    else if (['heic'].includes(ext)) mimeType = 'image/heic';
                    else if (['mp4', 'm4v'].includes(ext)) mimeType = 'video/mp4';
                    else if (['mov'].includes(ext)) mimeType = 'video/quicktime';
                    else if (['webm'].includes(ext)) mimeType = 'video/webm';
                    else if (['pdf'].includes(ext)) mimeType = 'application/pdf'; // Hỗ trợ PDF
                    
                    // Tạo lại Blob mới với đúng MIME type để trình duyệt hiểu
                    blob = blob.slice(0, blob.size, mimeType);
                }

                const url = URL.createObjectURL(blob);
                
                setFileData({
                    name: fileName,
                    url: url,
                    mimeType: mimeType,
                    size: meta.size,
                    downloadUrl: meta['@microsoft.graph.downloadUrl'] // Link công khai tạm thời
                });
            } catch (e: any) {
                console.error(e);
                setError(e.message || "Có lỗi xảy ra.");
            } finally {
                setLoading(false);
            }
        };
        loadFile();
    }, [fileId]);

    // Helpers xác định loại file (Check cả MIME Type đã fix và Đuôi file)
    const fileType = useMemo(() => {
        if (!fileData) return 'unknown';
        const name = fileData.name.toLowerCase();
        const mime = fileData.mimeType;

        if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
        if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/.test(name)) return 'image';
        if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/.test(name)) return 'video';
        return 'other';
    }, [fileData]);

    // Theme Config based on file type
    const isDarkTheme = fileType === 'video';

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
            <p className="text-slate-500 font-medium animate-pulse">Đang tải dữ liệu...</p>
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Không thể truy cập</h3>
            <p className="text-slate-500 mb-6">{error}</p>
            <a href="/" className="px-6 py-3 bg-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-300">
                Về trang chủ
            </a>
        </div>
    );

    return (
        <div className={`h-[100dvh] flex flex-col relative overflow-hidden ${isDarkTheme ? 'bg-black' : 'bg-slate-50'}`}>
            {/* Header: Absolute for Video (Overlay), Relative for PDF/Image (Solid) */}
            <div className={`
                flex-none z-30 transition-all
                ${isDarkTheme 
                    ? 'absolute top-0 left-0 w-full bg-gradient-to-b from-black/90 via-black/50 to-transparent p-4' 
                    : 'relative bg-white border-b border-slate-200 px-4 py-3 shadow-sm'
                }
            `}>
                <div className="flex justify-between items-start">
                    <div className={`${isDarkTheme ? 'text-white' : 'text-slate-800'} max-w-[70%]`}>
                        <h1 className="font-bold text-lg truncate drop-shadow-sm leading-tight">{fileData?.name}</h1>
                        <p className={`text-xs mt-0.5 ${isDarkTheme ? 'text-white/80' : 'text-slate-500'}`}>
                            {systemConfig.appName} • {fileData ? (fileData.size / 1024 / 1024).toFixed(2) : 0} MB
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <a 
                            href="/" 
                            className={`p-2.5 rounded-full transition-all shadow-sm ${
                                isDarkTheme 
                                ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-md' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                            }`}
                        >
                            <Home className="w-5 h-5" />
                        </a>
                        <a 
                            href={fileData?.url} 
                            download={fileData?.name}
                            className={`p-2.5 rounded-full transition-all shadow-sm ${
                                isDarkTheme 
                                ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-md' 
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'
                            }`}
                        >
                            <Download className="w-5 h-5" />
                        </a>
                    </div>
                </div>
            </div>

            {/* Viewer Content - Fills remaining space */}
            <div className={`flex-1 relative w-full h-full overflow-hidden flex items-center justify-center ${isDarkTheme ? 'bg-black' : 'bg-slate-100'}`}>
                {fileType === 'pdf' ? (
                    <div className="w-full h-full relative flex flex-col">
                        {/* PDF Toggle Button */}
                        <div className="absolute bottom-16 right-4 z-40">
                            <button 
                                onClick={() => setPdfViewMode(prev => prev === 'google' ? 'native' : 'google')}
                                className="bg-slate-800 text-white text-xs px-3 py-2 rounded-full shadow-lg opacity-80 hover:opacity-100 flex items-center gap-2 backdrop-blur-sm"
                            >
                                <RefreshCw className="w-3 h-3" />
                                {pdfViewMode === 'google' ? 'Dùng trình đọc Gốc' : 'Dùng Google Reader'}
                            </button>
                        </div>

                        {pdfViewMode === 'google' && fileData?.downloadUrl ? (
                            // MODE 1: GOOGLE DOCS VIEWER (Chống biến dạng trên mobile)
                            <iframe 
                                src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileData.downloadUrl)}`}
                                className="w-full h-full border-0 bg-white"
                                title="PDF Viewer"
                            />
                        ) : (
                            // MODE 2: NATIVE OBJECT (Fallback)
                            <object
                                data={`${fileData?.url}#view=FitH`}
                                type="application/pdf"
                                className="w-full h-full block bg-white"
                            >
                                <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-500">
                                    <FileIcon className="w-16 h-16 text-slate-300 mb-4" />
                                    <p className="mb-2 font-bold text-slate-700">Không thể xem trực tiếp</p>
                                    <p className="text-sm mb-6">Vui lòng tải về để xem.</p>
                                    <a 
                                        href={fileData?.url} 
                                        download={fileData?.name} 
                                        className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 w-full max-w-xs"
                                    >
                                        <Download className="w-5 h-5 inline-block mr-2" />
                                        Tải về máy
                                    </a>
                                </div>
                            </object>
                        )}
                    </div>
                ) : fileType === 'image' ? (
                    <div className="w-full h-full overflow-auto flex items-center justify-center p-2">
                        <img 
                            src={fileData?.url} 
                            alt="Content" 
                            className="max-w-full max-h-full object-contain shadow-lg" 
                        />
                    </div>
                ) : fileType === 'video' ? (
                    <video 
                        src={fileData?.url} 
                        controls 
                        autoPlay 
                        playsInline 
                        muted={false}
                        className="w-full h-full max-h-screen object-contain" 
                    />
                ) : (
                    <div className="bg-white p-8 rounded-2xl flex flex-col items-center text-center m-4 max-w-sm shadow-xl">
                        <FileIcon className="w-16 h-16 text-slate-400 mb-4" />
                        <p className="font-bold text-slate-700 mb-2">Định dạng không hỗ trợ xem trước</p>
                        <p className="text-xs text-slate-500 mb-6 break-all">{fileData?.name}</p>
                        <a 
                            href={fileData?.url} 
                            download={fileData?.name}
                            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 w-full"
                        >
                            Tải về máy
                        </a>
                    </div>
                )}
            </div>
            
             <div className={`absolute bottom-2 left-0 w-full text-center z-20 pointer-events-none ${isDarkTheme ? 'text-white/20' : 'text-slate-300'} `}>
                 <p className="text-[9px] uppercase tracking-widest font-medium">Powered by {systemConfig.appName}</p>
             </div>
        </div>
    );
};

export default function App() {
  // --- STATE ---
  const [usersList, setUsersList] = useState<User[]>(INITIAL_USERS);
  
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => {
    try {
      const saved = localStorage.getItem('systemConfig');
      return saved ? JSON.parse(saved) : DEFAULT_SYSTEM_CONFIG;
    } catch (e) {
      return DEFAULT_SYSTEM_CONFIG;
    }
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  
  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [regData, setRegData] = useState({ username: '', password: '', displayName: '', unit: '' });
  
  // Views
  const [currentView, setCurrentView] = useState<'camera' | 'history' | 'gallery' | 'settings' | 'user-manager' | 'visitor-manager'>('camera');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [deletedPhotos, setDeletedPhotos] = useState<PhotoRecord[]>([]); 
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<'uploads' | 'deleted'>('uploads'); 
  const [uploadDestination, setUploadDestination] = useState<'personal' | 'common'>('personal');

  // User Management
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userFilter, setUserFilter] = useState('');
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  
  // Permission Modal
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionTargetUser, setPermissionTargetUser] = useState<User | null>(null);
  const [systemFolders, setSystemFolders] = useState<ExtendedCloudItem[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [tempAllowedPaths, setTempAllowedPaths] = useState<Set<string>>(new Set());

  // QR Modal
  const [qrModalData, setQrModalData] = useState<{name: string, link: string} | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [qrLogs, setQrLogs] = useState<QRCodeLog[]>([]);
  const [isLoadingQrLogs, setIsLoadingQrLogs] = useState(false);

  // System Config
  const [tempSysConfig, setTempSysConfig] = useState<SystemConfig>(systemConfig);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Statistics
  const [stats, setStats] = useState<SystemStats>({ totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Gallery View
  const [galleryBreadcrumbs, setGalleryBreadcrumbs] = useState<{name: string, path: string}[]>([{name: 'Toàn đơn vị', path: ''}]);
  const [galleryItems, setGalleryItems] = useState<CloudItem[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [isViewingAll, setIsViewingAll] = useState(false);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set());

  // Share View
  const [sharingItem, setSharingItem] = useState<string | null>(null); 
  const [downloadingFolderId, setDownloadingFolderId] = useState<string | null>(null);
  
  // Guest View Params
  const [guestViewParams, setGuestViewParams] = useState<{unit: string, month: string} | null>(null);
  const [sharedFileId, setSharedFileId] = useState<string | null>(null);
  
  // Action State
  const [isRenaming, setIsRenaming] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const isGuest = user?.username === 'thannhan';

  // --- EFFECTS ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    
    // 1. Guest Check-in QR
    if (view === 'guest-visit') {
        const unit = params.get('unit');
        const month = params.get('month');
        if (unit && month) {
            setGuestViewParams({ unit, month });
            setShowSplash(false);
            return;
        }
    }
    
    // 2. Shared File QR (NEW LOGIC)
    if (view === 'share') {
        const id = params.get('id');
        if (id) {
            setSharedFileId(id);
            setShowSplash(false);
            return;
        }
    }
  }, []);
  
  useEffect(() => {
    if (guestViewParams || sharedFileId) return; 
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [guestViewParams, sharedFileId]);

  useEffect(() => {
    const initData = async () => {
      let activeConfig = { ...config };
      try {
        if (!config.simulateMode) await getAccessToken();
      } catch (e: any) {
         if (e.message === "API_NOT_FOUND" || (e.message && e.message.includes("Invalid API Response"))) {
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

  useEffect(() => {
    if (currentView === 'gallery' && user) {
        if (!isViewingAll) {
            loadGalleryPath("");
            setGalleryBreadcrumbs([{name: 'Thư viện', path: ''}]);
            setSelectedGalleryIds(new Set()); 
        }
    }
  }, [currentView, user]);

  useEffect(() => {
    if (currentView === 'settings' && user?.role === 'admin') {
      const loadStats = async () => {
        setIsStatsLoading(true);
        setIsLoadingQrLogs(true);
        try {
           const [cloudStats, logs] = await Promise.all([
             fetchSystemStats(config),
             fetchQRCodeLogs(config)
           ]);
           setStats({
               totalUsers: usersList.length,
               activeUsers: usersList.filter(u => u.status === 'active' || u.status === undefined).length, 
               totalFiles: cloudStats.totalFiles || 0,
               totalStorage: cloudStats.totalStorage || 0
           });
           setQrLogs(logs);
        } catch (e) { console.error(e); } 
        finally {
            setIsStatsLoading(false);
            setIsLoadingQrLogs(false);
        }
      };
      loadStats();
    }
  }, [currentView, user, usersList]);

  // --- HANDLERS ---
  const loadRecentPhotos = async (currentUser: User) => {
    setIsHistoryLoading(true);
    try {
      const uploads = await fetchUserRecentFiles(config, currentUser);
      setPhotos(uploads);
      const deleted = await fetchUserDeletedItems(config, currentUser);
      setDeletedPhotos(deleted);
    } catch (e) { console.error("Failed to load recent files", e); } 
    finally { setIsHistoryLoading(false); }
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
         localStorage.setItem('systemConfig', JSON.stringify(c)); 
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
          if (loggedUser.username === 'thannhan') {
             setCurrentView('gallery');
             setShowDisclaimer(false); 
          } else {
             setCurrentView('camera');
             setShowDisclaimer(true);
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
  
  const handleDeleteQRLog = async (id: string) => {
      if (!confirm("Bạn có chắc chắn muốn xóa log này không?")) return;
      setQrLogs(prev => prev.filter(l => l.id !== id));
      await deleteQRCodeLog(config, id);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regData.username || !regData.password || !regData.displayName || !regData.unit) {
      alert("Vui lòng điền đầy đủ thông tin!");
      return;
    }
    setIsLoading(true);
    try {
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
        status: 'pending' 
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
    setPhotos([]); 
    setShowDisclaimer(false);
    setGuestViewParams(null); 
    setSharedFileId(null); 
    setIsViewingAll(false); 
    window.history.replaceState(null, '', window.location.pathname);
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
        localStorage.setItem('systemConfig', JSON.stringify(finalConfig)); 
        alert("Đã lưu cấu hình thành công!");
      } else {
        alert("Lỗi lưu cấu hình.");
      }
    } catch(e) {
      alert("Có lỗi xảy ra.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
  
  // --- PERMISSION MODAL HANDLERS ---
  const handleOpenPermissions = async (targetUser: User) => {
    setPermissionTargetUser(targetUser);
    setShowPermissionModal(true);
    setTempAllowedPaths(new Set(targetUser.allowedPaths || []));
    setIsLoadingFolders(true);
    try {
        const rootItems = await listPathContents(config, "", { ...targetUser, role: 'admin' } as User);
        const folders = rootItems
            .filter(i => i.folder && !['system', 'users.json', 'config.json'].includes(i.name.toLowerCase()))
            .map(i => ({ ...i, level: 0, expanded: false } as ExtendedCloudItem));
        setSystemFolders(folders);
    } catch (e) { console.error(e); } finally { setIsLoadingFolders(false); }
  };

  const handleRefreshPermissionFolders = async () => {
      if (!permissionTargetUser) return;
      handleOpenPermissions(permissionTargetUser);
  };

  const handleToggleFolderExpand = async (item: ExtendedCloudItem) => {
      if (item.expanded) {
          const index = systemFolders.findIndex(f => f.id === item.id);
          if (index === -1) return;
          let endIndex = index + 1;
          while (endIndex < systemFolders.length && systemFolders[endIndex].level > item.level) {
              endIndex++;
          }
          const newFolders = [...systemFolders];
          newFolders.splice(index + 1, endIndex - (index + 1));
          newFolders[index].expanded = false;
          setSystemFolders(newFolders);
      } else {
          const index = systemFolders.findIndex(f => f.id === item.id);
          if (index === -1) return;
          const newFolders = [...systemFolders];
          newFolders[index].isLoadingChildren = true;
          setSystemFolders(newFolders);
          try {
             const children = await fetchFolderChildren(config, item.id);
             const extendedChildren = children.map(c => ({
                 ...c,
                 level: item.level + 1,
                 expanded: false
             } as ExtendedCloudItem));
             const updatedFolders = [...systemFolders];
             updatedFolders[index].expanded = true;
             updatedFolders[index].isLoadingChildren = false;
             updatedFolders[index].hasLoadedChildren = true;
             updatedFolders.splice(index + 1, 0, ...extendedChildren);
             setSystemFolders(updatedFolders);
          } catch (e) {
             const resetFolders = [...systemFolders];
             resetFolders[index].isLoadingChildren = false;
             setSystemFolders(resetFolders);
          }
      }
  };

  const handleTogglePermission = (folderName: string) => {
      const newSet = new Set(tempAllowedPaths);
      if (newSet.has(folderName)) {
          newSet.delete(folderName);
      } else {
          newSet.add(folderName);
      }
      setTempAllowedPaths(newSet);
  };

  const handleSavePermissions = async () => {
      if (!permissionTargetUser) return;
      setIsSavingUser(true);
      const updatedUser = {
          ...permissionTargetUser,
          allowedPaths: Array.from(tempAllowedPaths)
      };
      const newList = usersList.map(u => u.id === updatedUser.id ? updatedUser : u);
      try {
          const success = await saveUsersToOneDrive(newList, config);
          if (success) {
              setUsersList(newList);
              setShowPermissionModal(false);
              alert("Cập nhật quyền thành công!");
          } else {
              alert("Lỗi khi lưu dữ liệu.");
          }
      } catch (e) {
          alert("Lỗi hệ thống.");
      } finally {
          setIsSavingUser(false);
      }
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
      progress: 0 
    }));
    setPhotos(prev => [...newRecords, ...prev]);
    for (const record of newRecords) {
      if (!record.file) continue;
      try {
        if (!user) throw new Error("User not found");
        const result = await uploadToOneDrive(record.file, config, user, (progress) => {
            setPhotos(prev => prev.map(p => p.id === record.id ? { ...p, progress } : p));
        }, uploadDestination);
        setPhotos(prev => prev.map(p => {
          if (p.id === record.id) {
            const finalStatus = result.isPending ? UploadStatus.SUCCESS : (result.success ? UploadStatus.SUCCESS : UploadStatus.ERROR);
            const errorMsg = result.isPending ? "Đã gửi (Chờ duyệt)" : result.error;
            return {
              ...p,
              status: finalStatus,
              uploadedUrl: result.url,
              errorMessage: errorMsg,
              progress: 100 
            };
          }
          return p;
        }));
      } catch (error: any) {
        setPhotos(prev => prev.map(p => {
          if (p.id === record.id) {
            return { ...p, status: UploadStatus.ERROR, errorMessage: error.message || "Lỗi không xác định", progress: 0 };
          }
          return p;
        }));
      }
    }
    event.target.value = '';
  };

  const loadGalleryPath = async (path: string) => {
    if (!user) return;
    setIsGalleryLoading(true);
    try {
        const items = await listPathContents(config, path, user);
        let displayItems = items;
        if (user.role !== 'admin') {
            displayItems = displayItems.filter(i => !['system', 'bo_chi_huy'].includes(i.name.toLowerCase()));
        }
        const sorted = displayItems.sort((a, b) => {
            if (a.folder && !b.folder) return -1;
            if (!a.folder && b.folder) return 1;
            return a.name.localeCompare(b.name);
        });
        setGalleryItems(sorted);
        setSelectedGalleryIds(new Set()); 
    } catch(e) {
        setGalleryItems([]);
    } finally {
        setIsGalleryLoading(false);
    }
  };

  const handleViewAll = async () => {
     if(!user) return;
     setIsGalleryLoading(true);
     setIsViewingAll(true);
     setGalleryBreadcrumbs([
         {name: 'Thư viện', path: ''}, 
         {name: 'Tất cả file', path: 'ALL_MEDIA_SPECIAL_KEY'}
     ]);
     try {
         const items = await fetchAllMedia(config, user);
         const sorted = items.sort((a,b) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime());
         setGalleryItems(sorted);
         setSelectedGalleryIds(new Set());
     } catch(e) {
         setGalleryItems([]);
     } finally {
         setIsGalleryLoading(false);
     }
  };

  const handleGalleryClick = (item: CloudItem) => {
    if (selectedGalleryIds.size > 0) {
        handleToggleGallerySelect(item.id);
        return;
    }
    if (item.folder) {
        const currentPathString = galleryBreadcrumbs.map(b => b.path).filter(p => p && p !== 'ALL_MEDIA_SPECIAL_KEY').join('/');
        const newPathString = currentPathString ? `${currentPathString}/${item.name}` : item.name;
        setGalleryBreadcrumbs(prev => [...prev, { name: item.name, path: item.name }]);
        loadGalleryPath(newPathString);
    }
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
      let count = 0;
      for (const item of itemsToDownload) {
          if (item.folder) continue;
          const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`;
          try {
              const token = await getAccessToken();
              const res = await fetch(contentUrl, { headers: { 'Authorization': `Bearer ${token}` } });
              if(res.ok) {
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = item.name; 
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                  count++;
              }
          } catch(e) { console.error(e); }
          await new Promise(r => setTimeout(r, 500)); 
      }
      if (count > 0) setSelectedGalleryIds(new Set());
  };

  const handleBulkDelete = async () => {
      const itemsToDelete = galleryItems.filter(i => selectedGalleryIds.has(i.id));
      if (itemsToDelete.length === 0) return;
      const canDeleteAll = itemsToDelete.every(item => user?.role === 'admin' || item.name.startsWith(user!.username + '_'));
      if (!canDeleteAll) {
          alert("Bạn chỉ được phép xóa các file do mình tải lên!");
          return;
      }
      if (!confirm(`CẢNH BÁO: Xóa vĩnh viễn ${itemsToDelete.length} mục đã chọn?`)) return;
      setIsGalleryLoading(true); 
      let successCount = 0;
      for (const item of itemsToDelete) {
          try {
              await deleteFileFromOneDrive(config, item.id);
              successCount++;
          } catch(e) { console.error(e); }
      }
      alert(`Đã xóa ${successCount}/${itemsToDelete.length} mục.`);
      setGalleryItems(prev => prev.filter(i => !selectedGalleryIds.has(i.id)));
      setSelectedGalleryIds(new Set());
      setIsGalleryLoading(false);
  };
  
  const handleBulkApprove = async () => {
      if (!user || user.role !== 'admin') return;
      const itemsToApprove = galleryItems.filter(i => selectedGalleryIds.has(i.id));
      if (itemsToApprove.length === 0) return;
      if (!confirm(`Bạn có muốn duyệt ${itemsToApprove.length} file này vào Tư liệu chung?`)) return;
      setIsGalleryLoading(true);
      let count = 0;
      for (const item of itemsToApprove) {
          try {
             const success = await moveOneDriveItem(config, item.id, 'Tu_lieu_chung');
             if (success) count++;
          } catch (e) { console.error(e); }
      }
      alert(`Đã duyệt ${count} file.`);
      setGalleryItems(prev => prev.filter(i => !selectedGalleryIds.has(i.id))); 
      setSelectedGalleryIds(new Set());
      setIsGalleryLoading(false);
  };

  const handleBreadcrumbClick = (index: number) => {
      const targetCrumb = galleryBreadcrumbs[index];
      if (isViewingAll) {
          if (targetCrumb.path === 'ALL_MEDIA_SPECIAL_KEY') return;
          setIsViewingAll(false);
      }
      const newBreadcrumbs = galleryBreadcrumbs.slice(0, index + 1);
      setGalleryBreadcrumbs(newBreadcrumbs);
      const newPathString = newBreadcrumbs.map(b => b.path).filter(p => p && p !== 'ALL_MEDIA_SPECIAL_KEY').join('/');
      loadGalleryPath(newPathString);
  };

  const handleCreateGalleryLink = async (item: CloudItem) => {
      if (!user) return;
      setSharingItem(item.id);
      try {
          const link = `${window.location.origin}?view=share&id=${item.id}`;
          await navigator.clipboard.writeText(link);
          alert(`Đã copy link chia sẻ: ${item.name}`);
      } catch(e: any) {
          alert("Lỗi tạo link: " + e.message);
      } finally {
          setSharingItem(null);
      }
  };

  const handleShowQR = async (item: CloudItem) => {
      if (!user) return;
      setIsGeneratingQR(true);
      try {
          const proxyLink = `${window.location.origin}?view=share&id=${item.id}`;
          const logData: QRCodeLog = {
              id: Date.now().toString(),
              fileId: item.id,
              fileName: item.name,
              createdBy: user.displayName,
              createdDate: new Date().toISOString(),
              link: proxyLink 
          };
          saveQRCodeLog(logData, config); 
          setQrModalData({ name: item.name, link: proxyLink });
      } catch (e: any) {
          alert("Không thể tạo mã QR: " + e.message);
      } finally {
          setIsGeneratingQR(false);
      }
  };
  
  const handleGenerateQRForSelection = () => {
      if (selectedGalleryIds.size !== 1) return;
      const itemId = Array.from(selectedGalleryIds)[0];
      const item = galleryItems.find(i => i.id === itemId);
      if (item) handleShowQR(item);
  };
  
  const handleDownloadQRImage = () => {
      const canvas = qrRef.current?.querySelector('canvas');
      if (canvas && qrModalData) {
          const url = canvas.toDataURL("image/png");
          const a = document.createElement('a');
          a.href = url;
          a.download = `QR_${qrModalData.name.replace(/\s+/g, '_')}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
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
            setGalleryItems(prev => prev.map(i => i.id === item.id ? { ...i, name: newName.trim() } : i));
        } else {
            alert("Lỗi: " + result.error);
        }
    } catch (e) {
        alert("Có lỗi xảy ra khi đổi tên.");
    }
  };

  const handleDeleteGalleryItem = async (item: CloudItem) => {
     if(!user) return;
     const isOwner = item.name.startsWith(user.username + '_');
     if (user.role !== 'admin' && !isOwner) {
         alert("Bạn chỉ có thể xóa hình ảnh do chính mình tải lên!");
         return;
     }
     try {
         const success = await deleteFileFromOneDrive(config, item.id);
         if (success) {
             alert(`Đã xóa ${item.name}`);
             setGalleryItems(prev => prev.filter(i => i.id !== item.id));
         } else {
             alert("Không thể xóa file. Vui lòng thử lại.");
         }
     } catch (e) {
         alert("Lỗi hệ thống khi xóa file.");
     }
  };

  const PhotoPreview = ({ record }: { record: PhotoRecord }) => {
    const [src, setSrc] = useState<string | undefined>(record.previewUrl);
    const [hasError, setHasError] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    useEffect(() => {
        setSrc(record.previewUrl);
        setHasError(false);
        setIsRetrying(false);
    }, [record.previewUrl]);

    const handleLoadError = async () => {
        if (isRetrying || !record.id) {
            setHasError(true);
            return;
        }
        setIsRetrying(true);
        try {
            const token = await getAccessToken();
            const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${record.id}/content`;
            const res = await fetch(contentUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                setSrc(blobUrl);
            } else {
                setHasError(true);
            }
        } catch (e) {
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
    return (
       <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 flex-shrink-0">
         <ImageIcon className="w-6 h-6 text-slate-400" />
      </div>
    );
  };

  const handleCalculateUserStats = async () => {
      if(!user) return;
      setIsCalculatingStats(true);
      try {
          const allMedia = await fetchAllMedia(config, user);
          const updatedUsers = aggregateUserStats(allMedia, usersList);
          setUsersList(updatedUsers);
          alert("Đã cập nhật số liệu thống kê từ " + allMedia.length + " files.");
      } catch(e) {
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

  const filteredUsers = usersList.filter(u => {
      const term = userFilter.toLowerCase();
      return u.displayName.toLowerCase().includes(term) || 
             u.username.toLowerCase().includes(term) ||
             u.unit.toLowerCase().includes(term);
  });

  const getDisplayHistoryPhotos = () => {
    if (historyTab === 'deleted') {
        return deletedPhotos;
    }
    return photos; 
  };
  
  const isPendingFolder = galleryBreadcrumbs.some(b => b.name === 'Tu_lieu_chung_Cho_duyet');

  const themeStyle = { backgroundColor: systemConfig.themeColor };
  const textThemeStyle = { color: systemConfig.themeColor };
  const buttonStyle = { backgroundColor: systemConfig.themeColor };

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[100] bg-emerald-50 flex flex-col items-center justify-center animate-out fade-out duration-700 fill-mode-forwards">
         <div className="relative mb-6">
            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20 delay-100 duration-1000"></div>
            <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20 delay-300 duration-1000"></div>
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

  if (guestViewParams) {
      return (
          <VisitorForm 
            unitCode={guestViewParams.unit}
            monthStr={guestViewParams.month}
            config={config}
            onSuccess={() => {
                alert("Quay lại trang chính...");
                handleLogout(); 
            }}
            onCancel={() => handleLogout()}
          />
      );
  }

  if (sharedFileId) {
      return (
          <SharedFileViewer fileId={sharedFileId} systemConfig={systemConfig} />
      );
  }

  if (!user) {
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

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden relative">
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
                {uploadDestination === 'personal' ? (
                    <>Lưu trữ: <code className="bg-slate-100 px-1 rounded text-xs">.../{user.username}/T{(new Date().getMonth() + 1).toString().padStart(2, '0')}/Tuần_{Math.min(4, Math.ceil(new Date().getDate() / 7))}</code></>
                ) : (
                    <>Lưu trữ: <code className="bg-slate-100 px-1 rounded text-xs">.../Tu_lieu_chung/Chờ duyệt...</code></>
                )}
              </p>

              <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-slate-100 rounded-lg">
                  <button 
                    onClick={() => setUploadDestination('personal')}
                    className={`py-2 px-2 rounded-md text-sm font-bold flex items-center justify-center transition-all ${uploadDestination === 'personal' ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                      <UserPlus className="w-4 h-4 mr-2" /> Kho cá nhân
                  </button>
                  <button 
                    onClick={() => setUploadDestination('common')}
                    className={`py-2 px-2 rounded-md text-sm font-bold flex items-center justify-center transition-all ${uploadDestination === 'common' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                      <Globe className="w-4 h-4 mr-2" /> Tư liệu chung
                  </button>
              </div>
              
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
                Hoạt động gần đây (Tất cả)
              </h3>
              <button onClick={() => setCurrentView('history')} className="text-xs font-bold hover:underline" style={textThemeStyle}>Xem tất cả</button>
            </div>
            {isHistoryLoading ? (
              <div className="text-center py-6 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-1" /> Đang đồng bộ...</div>
            ) : photos.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có dữ liệu.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {photos.slice(0, 5).map((photo) => (
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center flex-wrap">
                    <PhotoPreview record={photo} />
                    <div className="ml-4 flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{photo.fileName}</p>
                      <div className="mt-1 flex items-center justify-between">
                         <div className="flex items-center">
                            {photo.status === UploadStatus.UPLOADING && <span className="text-xs text-blue-600 flex items-center font-medium"><Loader2 className="w-3 h-3 mr-1" /> Đang gửi...</span>}
                            {photo.status === UploadStatus.SUCCESS && !photo.errorMessage?.includes('Chờ duyệt') && <span className="text-xs text-green-600 flex items-center font-medium"><CheckCircle className="w-3 h-3 mr-1" /> Đã gửi</span>}
                            {photo.status === UploadStatus.SUCCESS && photo.errorMessage?.includes('Chờ duyệt') && <span className="text-xs text-amber-600 flex items-center font-medium"><Clock className="w-3 h-3 mr-1" /> Chờ duyệt</span>}
                            {photo.status === UploadStatus.ERROR && <span className="text-xs text-red-500 flex items-center font-medium"><XCircle className="w-3 h-3 mr-1" /> {photo.errorMessage}</span>}
                         </div>
                         <span className="text-[10px] text-slate-400">{photo.timestamp.toLocaleDateString('vi-VN')}</span>
                      </div>
                      
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
             <div className="flex bg-slate-100 rounded-lg p-1 mb-4">
                 <button 
                    onClick={() => setHistoryTab('uploads')}
                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${historyTab === 'uploads' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                 >
                     Đã tải lên
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
                            photo.status === UploadStatus.SUCCESS && photo.errorMessage?.includes('Chờ duyệt') ? 'bg-amber-100 text-amber-700' :
                            photo.status === UploadStatus.SUCCESS ? 'bg-green-100 text-green-700' :
                            photo.status === UploadStatus.UPLOADING ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'
                         }`}>
                           {historyTab === 'deleted' ? 'ĐÃ XÓA' : 
                            photo.status === UploadStatus.SUCCESS && photo.errorMessage?.includes('Chờ duyệt') ? 'CHỜ DUYỆT' :
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
                                            <div onClick={(e) => { e.stopPropagation(); handleToggleGallerySelect(item.id); }} className="mr-3 text-slate-400 hover:text-emerald-500">
                                                {isSelected ? <CheckSquare className="w-6 h-6 text-emerald-500" /> : <Square className="w-6 h-6" />}
                                            </div>

                                           <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mr-3 flex-shrink-0">
                                                <Folder className="w-6 h-6 text-amber-500 fill-amber-500" />
                                            </div>
                                           <div className="min-w-0">
                                               <p className="font-bold text-slate-700 text-sm truncate">{item.name}</p>
                                               <div className="flex items-center gap-2">
                                                   <p className="text-[10px] text-slate-400">
                                                       {item.folder?.childCount} mục • {new Date(item.lastModifiedDateTime).toLocaleDateString()}
                                                   </p>
                                                   {item.name === 'Tu_lieu_chung' && (
                                                       <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 rounded font-bold border border-indigo-200">CHUNG</span>
                                                   )}
                                                   {item.name === 'Tu_lieu_chung_Cho_duyet' && (
                                                       <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 rounded font-bold border border-amber-200">CHỜ DUYỆT</span>
                                                   )}
                                               </div>
                                           </div>
                                       </div>
                                       <div className="flex items-center gap-1">
                                           <button 
                                                onClick={(e) => { e.stopPropagation(); handleShowQR(item); }}
                                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full"
                                                title="Tạo mã QR"
                                           >
                                                {isGeneratingQR ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                                           </button>

                                           <button 
                                                onClick={(e) => { e.stopPropagation(); handleCreateGalleryLink(item); }}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                                                title="Chia sẻ thư mục"
                                           >
                                                <Share2 className="w-4 h-4" />
                                           </button>
                                           
                                           {user.role === 'admin' && (
                                                <>
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
               )}
            </div>
            
            {selectedGalleryIds.size > 0 && (
                <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 flex justify-between items-center z-50 animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center">
                        <div className="bg-emerald-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mr-3">
                            {selectedGalleryIds.size}
                        </div>
                        <span className="text-sm font-medium text-slate-700">Đã chọn</span>
                    </div>
                    <div className="flex gap-2">
                         {selectedGalleryIds.size === 1 && (
                            <button 
                                onClick={handleGenerateQRForSelection} 
                                className="bg-emerald-50 text-emerald-600 px-3 py-2 rounded-lg font-bold text-xs flex items-center hover:bg-emerald-100 border border-emerald-200"
                            >
                                {isGeneratingQR ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <QrCode className="w-4 h-4 mr-1" />}
                                QR Code
                            </button>
                         )}

                         {isPendingFolder && user.role === 'admin' && (
                            <button 
                                onClick={handleBulkApprove} 
                                className="bg-green-50 text-green-600 px-3 py-2 rounded-lg font-bold text-xs flex items-center hover:bg-green-100 border border-green-200"
                            >
                                <CheckCircle className="w-4 h-4 mr-1" /> Duyệt
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

        {currentView === 'visitor-manager' && !isGuest && (
            <VisitorManager 
                user={user}
                usersList={usersList} 
                config={config}
                themeColor={systemConfig.themeColor}
            />
        )}

        {qrModalData && (
            <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full flex flex-col items-center relative animate-in zoom-in-95 duration-200">
                    <button 
                        onClick={() => setQrModalData(null)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 bg-slate-100 rounded-full"
                    >
                        <XCircle className="w-6 h-6" />
                    </button>
                    
                    <h3 className="font-bold text-lg text-slate-800 mb-1 text-center">Mã QR Truy cập nhanh</h3>
                    <p className="text-xs text-slate-500 mb-6 text-center px-4">
                        Khách có thể quét mã này để xem mà không cần đăng nhập.
                    </p>
                    
                    <div ref={qrRef} className="bg-white p-6 rounded-xl shadow-inner border border-slate-200 flex flex-col items-center">
                        <QRCodeCanvas 
                            value={qrModalData.link} 
                            size={220} 
                            level={"H"}
                            imageSettings={{
                                src: systemConfig.logoUrl || "/logo302.svg",
                                x: undefined,
                                y: undefined,
                                height: 40,
                                width: 40,
                                excavate: true,
                            }}
                        />
                        <p className="mt-4 font-bold text-slate-800 text-center max-w-[200px] break-words text-sm">
                            {qrModalData.name}
                        </p>
                    </div>
                    
                    <button 
                        onClick={handleDownloadQRImage}
                        className="mt-6 w-full py-3 rounded-xl text-white font-bold text-sm shadow-lg hover:opacity-90 flex items-center justify-center transition-all"
                        style={buttonStyle}
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Tải ảnh QR
                    </button>
                </div>
            </div>
        )}

        {currentView === 'settings' && user.role === 'admin' && !isGuest && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-800 text-xl flex items-center">
              <Settings className="w-6 h-6 mr-2" style={textThemeStyle} />
              Quản trị hệ thống
            </h3>
            
             <div>
                <h4 className="font-bold text-slate-700 flex items-center mb-4 pb-2">
                   <BarChart3 className="w-4 h-4 mr-2 text-slate-500" />
                   Thống kê hệ thống
                </h4>
                <Statistics 
                    stats={stats} 
                    isLoading={isStatsLoading} 
                    color={systemConfig.themeColor}
                    onViewFiles={() => {
                        setIsViewingAll(true);
                        setCurrentView('gallery');
                        handleViewAll();
                    }} 
                />
             </div>

             <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h4 className="font-bold text-slate-700 flex items-center mb-4 border-b border-slate-100 pb-2">
                   <QrCode className="w-4 h-4 mr-2 text-slate-500" />
                   Quản lý Mã QR
                </h4>
                <div className="space-y-4">
                    <p className="text-xs text-slate-500">Danh sách các file đã được tạo mã QR (Public Link).</p>
                    {isLoadingQrLogs ? (
                        <div className="text-center py-4 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
                    ) : qrLogs.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs italic">Chưa có mã QR nào được tạo.</div>
                    ) : (
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                            {qrLogs.map(log => (
                                <div key={log.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs flex justify-between items-start">
                                    <div className="min-w-0 pr-2">
                                        <p className="font-bold text-slate-700 truncate">{log.fileName}</p>
                                        <p className="text-slate-500 mt-0.5">Tạo bởi: {log.createdBy}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {new Date(log.createdDate).toLocaleString('vi-VN')}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <a 
                                            href={log.link} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="p-1.5 bg-white border border-slate-200 rounded text-blue-600 hover:bg-blue-50"
                                            title="Mở link"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                        <button 
                                            onClick={() => handleDeleteQRLog(log.id)}
                                            className="p-1.5 bg-white border border-slate-200 rounded text-red-500 hover:bg-red-50 hover:border-red-200"
                                            title="Xóa log"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </div>

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
               <div className="flex items-center mb-4">
                   <button onClick={() => setCurrentView('settings')} className="mr-3 p-2 rounded-full hover:bg-slate-100">
                       <ChevronLeft className="w-6 h-6 text-slate-600" />
                   </button>
                   <h3 className="font-bold text-slate-800 text-xl">Quản lý cán bộ</h3>
               </div>

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
                                      {u.username !== 'admin' && (
                                          <button 
                                            onClick={() => handleOpenPermissions(u)} 
                                            className="p-1.5 text-amber-600 bg-amber-50 rounded hover:bg-amber-100 border border-amber-200"
                                            title="Phân quyền xem thư mục"
                                          >
                                              <FolderLock className="w-4 h-4" />
                                          </button>
                                      )}

                                      <button onClick={() => startEditUser(u)} className="p-1.5 text-blue-500 bg-blue-50 rounded hover:bg-blue-100"><Edit className="w-4 h-4" /></button>
                                      {u.username !== 'admin' && <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 text-red-500 bg-red-50 rounded hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>}
                                    </div>
                                 </div>
                             </div>
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

        {showPermissionModal && permissionTargetUser && (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[80vh] flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center text-slate-800 font-bold">
                            <FolderLock className="w-5 h-5 mr-2 text-amber-500" />
                            Phân quyền xem
                        </div>
                        <div className="flex gap-2">
                             <button 
                                onClick={handleRefreshPermissionFolders} 
                                className="p-1 hover:bg-slate-100 rounded-full text-slate-500 hover:text-blue-600"
                                title="Làm mới danh sách thư mục"
                             >
                                <RefreshCw className={`w-5 h-5 ${isLoadingFolders ? 'animate-spin text-blue-500' : ''}`} />
                             </button>
                             <button onClick={() => setShowPermissionModal(false)} className="p-1 hover:bg-slate-100 rounded-full">
                                <XCircle className="w-6 h-6 text-slate-400" />
                             </button>
                        </div>
                    </div>
                    
                    <div className="p-4 bg-slate-50 border-b border-slate-100">
                        <p className="text-sm font-medium text-slate-700">Người dùng: <span className="font-bold">{permissionTargetUser.displayName}</span></p>
                        <p className="text-xs text-slate-500 mt-1">Chọn các thư mục mà người dùng được phép truy cập. Nhấn vào mũi tên để xem thư mục con.</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-1">
                        {isLoadingFolders ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                            </div>
                        ) : systemFolders.length === 0 ? (
                            <div className="text-center text-slate-400 py-4">Chưa có thư mục nào.</div>
                        ) : (
                            systemFolders.map(folder => {
                                const isAllowed = tempAllowedPaths.has(folder.name);
                                return (
                                    <div 
                                        key={folder.id} 
                                        className="flex items-center p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                                        style={{ paddingLeft: `${(folder.level * 16) + 8}px` }}
                                    >
                                        <button 
                                            onClick={() => handleToggleFolderExpand(folder)}
                                            className="p-1 mr-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200"
                                        >
                                            {folder.isLoadingChildren ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <ChevronDown 
                                                    className={`w-4 h-4 transition-transform duration-200 ${folder.expanded ? '' : '-rotate-90'}`} 
                                                />
                                            )}
                                        </button>

                                        <label className="flex items-center flex-1 cursor-pointer select-none">
                                            <div className="relative flex items-center">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    checked={isAllowed}
                                                    onChange={() => handleTogglePermission(folder.name)}
                                                />
                                            </div>
                                            <div className="ml-3 min-w-0">
                                                <p className="text-sm font-medium truncate ${isAllowed ? 'text-emerald-700' : 'text-slate-700'}`}>{folder.name}</p>
                                            </div>
                                        </label>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
                        <button 
                            onClick={handleSavePermissions}
                            disabled={isSavingUser}
                            className="w-full py-3 text-white font-bold rounded-xl shadow-lg hover:opacity-90 flex items-center justify-center transition-all"
                            style={buttonStyle}
                        >
                            {isSavingUser ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                            Lưu thay đổi
                        </button>
                    </div>
                </div>
            </div>
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 flex justify-around items-center py-2 pb-safe flex-none shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
        {!isGuest && (
            <TabButton active={currentView === 'camera'} onClick={() => setCurrentView('camera')} icon={<Camera />} label="Upload" color={systemConfig.themeColor} />
        )}
        <TabButton 
            active={currentView === 'gallery'} 
            onClick={() => {
                if (currentView === 'gallery') {
                    setIsViewingAll(false);
                    loadGalleryPath("");
                    setGalleryBreadcrumbs([{name: 'Thư viện', path: ''}]);
                } else {
                    setIsViewingAll(false);
                    setCurrentView('gallery');
                }
            }} 
            icon={<Library />} 
            label="Thư viện" 
            color={systemConfig.themeColor} 
        />
        {!isGuest && (
            <TabButton active={currentView === 'visitor-manager'} onClick={() => setCurrentView('visitor-manager')} icon={<HeartHandshake />} label="Thân nhân" color={systemConfig.themeColor} />
        )}
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
