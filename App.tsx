
import React, { useState, useRef, useEffect } from 'react';
import { User, PhotoRecord, UploadStatus, AppConfig } from './types';
import { INITIAL_USERS, login } from './services/mockAuth';
import { uploadToOneDrive } from './services/graphService';
import { Button } from './components/Button';
import { Camera, LogOut, Info, Settings, History, CheckCircle, XCircle, Loader2, Image as ImageIcon, Users, Trash2, Plus, Edit } from 'lucide-react';

const APP_VERSION = "3.0.2 (Sư đoàn 302)";

const DEFAULT_CONFIG: AppConfig = {
  oneDriveToken: '', 
  targetFolder: 'SnapSync302', // Thư mục gốc mới
  simulateMode: false,
};

export default function App() {
  // --- STATE ---
  // Quản lý danh sách User (lưu localStorage để giả lập DB)
  const [usersList, setUsersList] = useState<User[]>(() => {
    const saved = localStorage.getItem('snapsync_users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  // Views: camera, history, settings (Đã xóa blueprint)
  const [currentView, setCurrentView] = useState<'camera' | 'history' | 'settings'>('camera');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  
  // User Management State
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECTS ---
  useEffect(() => {
    localStorage.setItem('snapsync_users', JSON.stringify(usersList));
  }, [usersList]);

  // --- HANDLERS ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    try {
      // Truyền usersList hiện tại vào hàm login để check
      const loggedUser = await login(username, password, usersList);
      if (loggedUser) {
        setUser(loggedUser);
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
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const previewUrl = URL.createObjectURL(file);
    
    const newPhoto: PhotoRecord = {
      id: Date.now().toString(),
      file,
      previewUrl,
      status: UploadStatus.UPLOADING,
      timestamp: new Date(),
    };

    setPhotos(prev => [newPhoto, ...prev]);
    
    try {
      const result = await uploadToOneDrive(file, config, user);
      
      setPhotos(prev => prev.map(p => {
        if (p.id === newPhoto.id) {
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
      console.error("Upload failed:", error);
      setPhotos(prev => prev.map(p => {
        if (p.id === newPhoto.id) {
          return {
            ...p,
            status: UploadStatus.ERROR,
            errorMessage: error.message || "Lỗi không xác định"
          };
        }
        return p;
      }));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // --- USER MANAGEMENT HANDLERS ---
  const handleDeleteUser = (id: string) => {
    if (confirm('Bạn có chắc muốn xóa cán bộ này?')) {
      setUsersList(prev => prev.filter(u => u.id !== id));
    }
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.username || !editingUser.password || !editingUser.displayName || !editingUser.unit) {
      alert("Vui lòng điền đầy đủ thông tin");
      return;
    }

    if (editingUser.id) {
      // Edit existing
      setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...editingUser } as User : u));
    } else {
      // Add new
      const newUser: User = {
        id: Date.now().toString(),
        username: editingUser.username,
        password: editingUser.password,
        displayName: editingUser.displayName,
        unit: editingUser.unit,
        role: 'staff' // Mặc định là staff
      } as User;
      setUsersList(prev => [...prev, newUser]);
    }
    setIsEditingUser(false);
    setEditingUser({});
  };

  const startEditUser = (u?: User) => {
    setEditingUser(u || { role: 'staff' });
    setIsEditingUser(true);
  };

  // --- RENDER ---

  if (!user) {
    return (
      <div className="min-h-screen bg-primary-50 flex flex-col justify-center px-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-primary-100 max-w-sm w-full mx-auto">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
              <img src="https://cdn-icons-png.flaticon.com/512/6534/6534062.png" className="w-12 h-12" alt="Logo" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-primary-900 mb-1 uppercase tracking-tight">SnapSync 302</h1>
          <p className="text-center text-primary-600 font-medium mb-6 text-sm">Hệ thống upload hình ảnh quân nhân</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản</label>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors"
                placeholder="Nhập tên đăng nhập"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors"
                placeholder="Nhập mật khẩu"
              />
            </div>
            
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center">
                <Info className="w-4 h-4 mr-2" />
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full font-bold shadow-lg bg-primary-600 hover:bg-primary-700 text-white" isLoading={isLoading}>
              Đăng nhập
            </Button>
          </form>
          <div className="mt-8 text-center text-xs text-slate-400">
            Sư đoàn 302 - Phiên bản {APP_VERSION}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <header className="bg-primary-700 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20">
        <div>
          <h2 className="font-bold text-white text-lg tracking-wide">SNAPSYNC 302</h2>
          <div className="flex items-center text-primary-100 text-xs mt-0.5">
            <span className="bg-primary-800 px-1.5 py-0.5 rounded mr-2">{user.unit}</span>
            <span>{user.displayName}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 text-primary-200 hover:text-white transition-colors bg-primary-800/50 rounded-lg">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 scroll-smooth bg-slate-50">
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden" 
        />

        {currentView === 'camera' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-primary-800 mb-2">Hệ thống đăng tải và lưu trữ hình ảnh Sư đoàn 302</h3>
              <p className="text-slate-500 text-sm mb-6">
                Ảnh sẽ được lưu tại: <br/>
                <code className="bg-slate-100 px-1 py-0.5 rounded text-xs text-slate-600 mt-1 block w-fit">
                   .../{user.unit}/{user.username}/{new Date().toISOString().split('T')[0]}
                </code>
              </p>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-primary-600 text-white py-5 rounded-xl font-bold flex items-center justify-center text-lg hover:bg-primary-700 active:scale-95 transition-all shadow-lg shadow-primary-600/30"
              >
                <Camera className="w-8 h-8 mr-3" />
                CHỤP & GỬI ẢNH
              </button>
            </div>

            <div className="flex justify-between items-center mt-8 mb-4 border-b border-slate-200 pb-2">
              <h3 className="font-bold text-slate-700 flex items-center">
                <History className="w-4 h-4 mr-2 text-slate-400" />
                Hoạt động gần đây
              </h3>
              <button onClick={() => setCurrentView('history')} className="text-xs text-primary-600 font-bold hover:underline">Xem tất cả</button>
            </div>

            {photos.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có dữ liệu hình ảnh.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {photos.slice(0, 3).map((photo) => (
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                    <img src={photo.previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg bg-slate-100 border border-slate-200" />
                    <div className="ml-4 flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{photo.file.name}</p>
                      
                      <div className="mt-1 flex items-center">
                        {photo.status === UploadStatus.UPLOADING && (
                          <span className="text-xs text-blue-600 flex items-center font-medium">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang gửi...
                          </span>
                        )}
                        {photo.status === UploadStatus.SUCCESS && (
                          <span className="text-xs text-green-600 flex items-center font-medium">
                            <CheckCircle className="w-3 h-3 mr-1" /> Đã gửi xong
                          </span>
                        )}
                        {photo.status === UploadStatus.ERROR && (
                          <span className="text-xs text-red-500 flex items-center font-medium">
                            <XCircle className="w-3 h-3 mr-1" /> {photo.errorMessage}
                          </span>
                        )}
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
             <h3 className="font-bold text-slate-800 text-lg mb-4">Lịch sử gửi ảnh</h3>
             {photos.length === 0 && <p className="text-slate-500 text-center">Trống</p>}
             {photos.map((photo) => (
              <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                 <img src={photo.previewUrl} alt="Preview" className="w-12 h-12 object-cover rounded-lg bg-slate-100" />
                 <div className="ml-3 flex-1">
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

        {currentView === 'settings' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-800 text-xl flex items-center">
              <Settings className="w-6 h-6 mr-2 text-primary-600" />
              Quản trị hệ thống
            </h3>
            
            {/* Form thêm/sửa user */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
               <div className="flex justify-between items-center mb-4">
                 <h4 className="font-bold text-slate-700">Danh sách cán bộ</h4>
                 {!isEditingUser && (
                   <button onClick={() => startEditUser()} className="text-xs bg-primary-600 text-white px-3 py-2 rounded-lg font-bold flex items-center">
                     <Plus className="w-3 h-3 mr-1" /> Thêm mới
                   </button>
                 )}
               </div>

               {isEditingUser ? (
                 <form onSubmit={handleSaveUser} className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4 animate-in fade-in zoom-in duration-200">
                    <h5 className="font-bold text-sm mb-3 text-primary-700">{editingUser.id ? 'Sửa thông tin' : 'Thêm cán bộ mới'}</h5>
                    <div className="space-y-3">
                      <input 
                        className="w-full text-sm p-2 border rounded" 
                        placeholder="Họ và tên (VD: Nguyễn Văn A)" 
                        value={editingUser.displayName || ''} 
                        onChange={e => setEditingUser({...editingUser, displayName: e.target.value})}
                      />
                      <input 
                        className="w-full text-sm p-2 border rounded" 
                        placeholder="Tên đăng nhập (VD: user1)" 
                        value={editingUser.username || ''} 
                        onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                      />
                      <input 
                        className="w-full text-sm p-2 border rounded" 
                        placeholder="Mật khẩu" 
                        value={editingUser.password || ''} 
                        onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                      />
                      <input 
                        className="w-full text-sm p-2 border rounded" 
                        placeholder="Đơn vị (VD: Tieu_doan_1)" 
                        value={editingUser.unit || ''} 
                        onChange={e => setEditingUser({...editingUser, unit: e.target.value})}
                      />
                      <div className="flex gap-2 mt-2">
                        <Button type="submit" className="py-2 text-sm flex-1 bg-primary-600 hover:bg-primary-700">Lưu</Button>
                        <Button type="button" variant="secondary" className="py-2 text-sm" onClick={() => setIsEditingUser(false)}>Hủy</Button>
                      </div>
                    </div>
                 </form>
               ) : (
                 <div className="space-y-3">
                   {usersList.map(u => (
                     <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                       <div>
                         <p className="font-bold text-sm text-slate-800">{u.displayName}</p>
                         <p className="text-xs text-slate-500">{u.unit} • {u.username}</p>
                       </div>
                       <div className="flex gap-1">
                          <button onClick={() => startEditUser(u)} className="p-2 text-blue-500 bg-white rounded shadow-sm hover:bg-blue-50">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-red-500 bg-white rounded shadow-sm hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
            
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 text-xs text-orange-800">
               <strong>Lưu ý quản trị:</strong>
               <p className="mt-1">Dữ liệu tài khoản hiện tại được lưu trên trình duyệt này. Nếu xóa cache, dữ liệu sẽ trở về mặc định.</p>
            </div>
          </div>
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 flex justify-around items-center py-2 pb-safe absolute bottom-0 w-full z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <TabButton active={currentView === 'camera'} onClick={() => setCurrentView('camera')} icon={<Camera />} label="Chụp ảnh" />
        <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="Lịch sử" />
        <TabButton active={currentView === 'settings'} onClick={() => setCurrentView('settings')} icon={<Settings />} label="Quản trị" />
      </nav>
    </div>
  );
}

const TabButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full py-1 transition-all duration-200 ${active ? 'text-primary-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
  >
    <div className={`w-6 h-6 ${active ? 'fill-current' : ''}`}>
      {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: active ? 2.5 : 2 })}
    </div>
    <span className="text-[10px] font-bold mt-1">{label}</span>
  </button>
);