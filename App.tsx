
// BCT0902
import React, { useState, useEffect, useRef } from 'react';
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
import { VisitorManager } from './components/VisitorManager'; // New Component
import { VisitorForm } from './components/VisitorForm'; // New Component
import { QRCodeCanvas } from 'qrcode.react';
import { AppConfig, User, SystemConfig, CloudItem, PhotoRecord, UploadStatus, SystemStats, QRCodeLog } from './types';
import { 
  Camera, LogOut, Info, Settings, History, CheckCircle, XCircle, 
  Loader2, Image as ImageIcon, Users, Trash2, Plus, Edit,
  FileArchive, Film, FolderUp, Files, File as FileIcon, RefreshCw, Database,
  Share2, Folder, FolderOpen, Link as LinkIcon, ChevronLeft, ChevronRight, Download,
  AlertTriangle, Shield, Palette, Save, UserPlus, Check, UploadCloud, Library, Home,
  BarChart3, Grid, Pencil, Eye, EyeOff, Lock, CheckSquare, Square, Calculator, Clock, Globe,
  FolderLock, ChevronDown, QrCode, ExternalLink, HeartHandshake, AlertCircle, User as UserIcon
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

// Interface mở rộng cho Tree View
interface ExtendedCloudItem extends CloudItem {
  level: number;
  expanded?: boolean;
  isLoadingChildren?: boolean;
  hasLoadedChildren?: boolean;
}

// --- NEW COMPONENT: Shared File Viewer (Public View via App Proxy) ---
const SharedFileViewer = ({ fileId, systemConfig }: { fileId: string, systemConfig: SystemConfig }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fileData, setFileData] = useState<{name: string, url: string, mimeType: string, size: number} | null>(null);

    useEffect(() => {
        const loadFile = async () => {
            try {
                const token = await getAccessToken();
                
                // 1. Get Metadata
                const metaUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?select=id,name,file,size`;
                const metaRes = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!metaRes.ok) throw new Error("File không tồn tại hoặc đã bị xóa.");
                const meta = await metaRes.json();

                // 2. Get Content
                const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`;
                const contentRes = await fetch(contentUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                
                if (!contentRes.ok) {
                    throw new Error("Không thể tải nội dung file (Lỗi kết nối).");
                }
                
                // Check Content-Type để tránh lỗi parse JSON với file binary
                const contentType = contentRes.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const err = await contentRes.json();
                    throw new Error(err.error?.message || "Lỗi tải file từ hệ thống.");
                }

                const blob = await contentRes.blob();
                const url = URL.createObjectURL(blob);
                
                setFileData({
                    name: meta.name,
                    url: url,
                    mimeType: meta.file?.mimeType || 'application/octet-stream',
                    size: meta.size
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

    // Helpers để xác định loại file dựa trên cả MimeType VÀ Đuôi file
    const isImage = fileData && (
        fileData.mimeType.startsWith('image/') || 
        /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(fileData.name)
    );

    const isVideo = fileData && (
        fileData.mimeType.startsWith('video/') || 
        /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(fileData.name)
    );

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
            <p className="text-slate-500 font-medium animate-pulse">Đang tải dữ liệu an toàn...</p>
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
        <div className="min-h-screen bg-black flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-b from-black/80 to-transparent p-4 flex justify-between items-start absolute top-0 w-full z-20">
                <div className="text-white">
                    <h1 className="font-bold text-lg truncate pr-4 drop-shadow-md">{fileData?.name}</h1>
                    <p className="text-xs text-white/80 opacity-80">
                        {systemConfig.appName} • {fileData ? (fileData.size / 1024 / 1024).toFixed(2) : 0} MB
                    </p>
                </div>
                <div className="flex gap-2">
                    <a href="/" className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-all shadow-lg">
                        <Home className="w-6 h-6" />
                    </a>
                    <a 
                        href={fileData?.url} 
                        download={fileData?.name}
                        className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-all shadow-lg"
                    >
                        <Download className="w-6 h-6" />
                    </a>
                </div>
            </div>

            {/* Viewer */}
            <div className="flex-1 flex items-center justify-center p-2 sm:p-6 overflow-hidden relative">
                {isImage ? (
                    <img src={fileData?.url} alt="Content" className="max-w-full max-h-full object-contain shadow-2xl rounded-sm" />
                ) : isVideo ? (
                    <video src={fileData?.url} controls autoPlay playsInline className="max-w-full max-h-full shadow-2xl rounded-sm" />
                ) : (
                    <div className="bg-white p-8 rounded-2xl flex flex-col items-center text-center">
                        <FileIcon className="w-16 h-16 text-slate-400 mb-4" />
                        <p className="font-bold text-slate-700 mb-4">File này không hỗ trợ xem trước</p>
                        <p className="text-xs text-slate-500 mb-6">{fileData?.mimeType}</p>
                        <a 
                            href={fileData?.url} 
                            download={fileData?.name}
                            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700"
                        >
                            Tải về máy
                        </a>
                    </div>
                )}
            </div>
            
             <div className="absolute bottom-6 left-0 w-full text-center z-20 pointer-events-none">
                 <p className="text-white/30 text-[10px] uppercase tracking-widest">Powered by {systemConfig.appName}</p>
             </div>
        </div>
    );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [loading, setLoading] = useState(false);

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usersList, setUsersList] = useState<User[]>([]);

  // View State
  const query = new URLSearchParams(window.location.search);
  const viewMode = query.get('view'); // guest-visit
  const fileId = query.get('id'); // Shared File
  const unitCode = query.get('unit');
  const monthStr = query.get('month');

  // INITIALIZATION with API CHECK
  useEffect(() => {
    const initSystem = async () => {
        let activeConfig = { ...config };
        
        // 1. Check API Availability
        if (!activeConfig.simulateMode) {
            try {
                // Thử lấy token để xem backend có sống không
                await getAccessToken();
            } catch (e: any) {
                // Nếu lỗi, chuyển sang chế độ mô phỏng
                console.warn("Backend API unavailable. Switching to Simulation Mode.");
                activeConfig.simulateMode = true;
                setConfig(prev => ({ ...prev, simulateMode: true }));
            }
        }

        // 2. Load Initial Data using the determined config
        try {
            const [sysConf, users] = await Promise.all([
                fetchSystemConfig(activeConfig),
                fetchUsersFromOneDrive(activeConfig)
            ]);
            setSystemConfig(sysConf);
            setUsersList(users);
        } catch (e) {
            console.error("Initialization error", e);
            // Fallback to defaults
            setUsersList(INITIAL_USERS);
        }
    };
    
    initSystem();
  }, []); // Run once on mount

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          // Use current config state
          const latestUsers = await fetchUsersFromOneDrive(config);
          setUsersList(latestUsers);
          const u = await login(username, password, latestUsers);
          if (u) setUser(u);
          else alert("Đăng nhập thất bại");
      } catch(e) { alert("Lỗi hệ thống"); }
      setLoading(false);
  };

  // ROUTING
  if (fileId) {
      return <SharedFileViewer fileId={fileId} systemConfig={systemConfig} />;
  }

  if (viewMode === 'guest-visit' && unitCode && monthStr) {
      return (
        <VisitorForm 
            unitCode={unitCode} 
            monthStr={monthStr} 
            config={config} 
            onSuccess={() => alert("Đăng ký thành công!")} 
            onCancel={() => window.location.href = '/'} 
        />
      );
  }

  if (!user) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4" style={{ backgroundColor: systemConfig.themeColor }}>
              <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                  <div className="text-center mb-8">
                      {systemConfig.logoUrl ? (
                          <img src={systemConfig.logoUrl} className="h-20 mx-auto mb-4 object-contain" />
                      ) : (
                          <div className="h-20 w-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Shield className="w-10 h-10 text-emerald-600" />
                          </div>
                      )}
                      <h1 className="text-2xl font-bold text-slate-800">{systemConfig.appName}</h1>
                      <p className="text-sm text-slate-500 mt-1">{APP_VERSION_TEXT}</p>
                      {config.simulateMode && <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-bold">Chế độ mô phỏng</span>}
                  </div>
                  <form onSubmit={handleLogin} className="space-y-5">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Tài khoản</label>
                          <div className="relative">
                              <UserIcon className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
                              <input 
                                  type="text" 
                                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                  placeholder="Nhập tên đăng nhập"
                                  value={username}
                                  onChange={e => setUsername(e.target.value)}
                              />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Mật khẩu</label>
                          <div className="relative">
                              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
                              <input 
                                  type="password" 
                                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                  placeholder="Nhập mật khẩu"
                                  value={password}
                                  onChange={e => setPassword(e.target.value)}
                              />
                          </div>
                      </div>
                      <Button 
                        type="submit" 
                        isLoading={loading} 
                        className="w-full py-3.5 rounded-xl font-bold text-base shadow-lg shadow-emerald-200"
                        style={{ backgroundColor: systemConfig.themeColor }}
                      >
                          Đăng Nhập
                      </Button>
                  </form>
              </div>
          </div>
      );
  }

  // AUTHENTICATED VIEW
  return <Dashboard user={user} config={config} systemConfig={systemConfig} usersList={usersList} onLogout={() => setUser(null)} />;
}

// DASHBOARD COMPONENT
const Dashboard = ({ user, config, systemConfig, usersList, onLogout }: { user: User, config: AppConfig, systemConfig: SystemConfig, usersList: User[], onLogout: () => void }) => {
    const [tab, setTab] = useState('home');
    const [stats, setStats] = useState<SystemStats>({ totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 });
    const [recentFiles, setRecentFiles] = useState<CloudItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const s = await fetchSystemStats(config);
            setStats(s);
            const files = await fetchUserRecentFiles(config, user);
            // Mapper
            const items: CloudItem[] = files.map(f => ({
                id: f.id,
                name: f.fileName,
                file: { mimeType: f.mimeType || 'application/octet-stream' },
                webUrl: f.uploadedUrl || '',
                lastModifiedDateTime: f.timestamp.toISOString(),
                size: f.size || 0,
                thumbnailUrl: f.previewUrl,
                mediumUrl: f.previewUrl,
                largeUrl: f.previewUrl,
                downloadUrl: f.uploadedUrl
            }));
            setRecentFiles(items);
            setLoading(false);
        };
        load();
    }, [user, config]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <header className="bg-white shadow-sm px-4 py-3 flex justify-between items-center sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    {systemConfig.logoUrl ? <img src={systemConfig.logoUrl} className="h-8 w-8 object-contain" /> : <Shield className="w-8 h-8 text-emerald-600" />}
                    <div>
                        <h1 className="font-bold text-slate-800 text-sm">{systemConfig.appName}</h1>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{user.role === 'admin' ? 'Quản trị viên' : 'Cán bộ'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs font-bold text-slate-700">{user.displayName}</p>
                        <p className="text-[10px] text-slate-500">{user.unit}</p>
                    </div>
                    <button onClick={onLogout} className="p-2 bg-slate-100 rounded-full hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Nav */}
            <div className="bg-white border-b border-slate-200 px-2 flex gap-1 overflow-x-auto shadow-sm">
                <button onClick={() => setTab('home')} className={`p-3 text-sm font-bold border-b-2 whitespace-nowrap ${tab === 'home' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500'}`}>
                    Tổng quan
                </button>
                <button onClick={() => setTab('visitors')} className={`p-3 text-sm font-bold border-b-2 whitespace-nowrap ${tab === 'visitors' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500'}`}>
                    Thăm gặp
                </button>
                 {user.role === 'admin' && (
                    <button onClick={() => setTab('settings')} className={`p-3 text-sm font-bold border-b-2 whitespace-nowrap ${tab === 'settings' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500'}`}>
                        Hệ thống
                    </button>
                )}
            </div>

            {/* Main */}
            <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
                {tab === 'home' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <Statistics stats={stats} isLoading={loading} color={systemConfig.themeColor} />
                        
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center">
                                    <Clock className="w-5 h-5 mr-2 text-emerald-600" />
                                    Mới cập nhật
                                </h3>
                                <button className="text-xs text-blue-600 font-bold hover:underline">Xem tất cả</button>
                            </div>
                            <Album items={recentFiles} color={systemConfig.themeColor} isAdmin={user.role === 'admin'} currentUser={user} />
                        </div>
                    </div>
                )}

                {tab === 'visitors' && (
                    <div className="animate-in fade-in duration-300">
                        <VisitorManager user={user} usersList={usersList} config={config} themeColor={systemConfig.themeColor} />
                    </div>
                )}
                
                {tab === 'settings' && (
                    <div className="text-center py-12 bg-white rounded-xl border border-slate-200 animate-in fade-in duration-300">
                        <Settings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">Cấu hình hệ thống (Coming Soon)</p>
                    </div>
                )}
            </main>
        </div>
    );
};
