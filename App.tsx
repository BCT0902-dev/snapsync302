import React, { useState, useRef } from 'react';
import { User, PhotoRecord, UploadStatus, AppConfig } from './types';
import { login } from './services/mockAuth';
import { uploadToOneDrive } from './services/graphService';
import { Button } from './components/Button';
import { Camera, UploadCloud, LogOut, Info, Settings, History, CheckCircle, XCircle, Loader2, Image as ImageIcon } from 'lucide-react';

const APP_VERSION = "2.0.1"; // Update version for better error handling

const DEFAULT_CONFIG: AppConfig = {
  oneDriveToken: '', 
  targetFolder: 'SnapSync_Uploads',
  simulateMode: false, // Mặc định tắt giả lập để chạy thật
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  const [currentView, setCurrentView] = useState<'camera' | 'history' | 'settings' | 'blueprint'>('camera');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    try {
      const loggedUser = await login(username, password);
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
      // Truyền thêm username để tạo folder riêng cho từng nhân viên: SnapSync_Uploads/canbo1/anh.jpg
      const result = await uploadToOneDrive(file, config, user?.username);
      
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
      // Cải tiến: Hiển thị lỗi thực tế để dễ debug (ví dụ: Missing env vars)
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

  const triggerCamera = () => {
    fileInputRef.current?.click();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full mx-auto">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <UploadCloud className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">SnapSync Ent.</h1>
          <p className="text-center text-slate-500 mb-8 text-sm">Hệ thống upload ảnh hiện trường</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản</label>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                placeholder="Nhập tài khoản (admin/canbo1)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                placeholder="Nhập mật khẩu (123456)"
              />
            </div>
            
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center">
                <Info className="w-4 h-4 mr-2" />
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full font-bold shadow-lg" isLoading={isLoading}>
              Đăng nhập
            </Button>
          </form>
          <div className="mt-6 text-center text-xs text-slate-400">
            Phiên bản {APP_VERSION}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <header className="bg-white px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
        <div>
          <h2 className="font-bold text-slate-800 text-lg">SnapSync</h2>
          <p className="text-xs text-slate-500">Xin chào, {user.displayName}</p>
        </div>
        <button onClick={() => setUser(null)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 scroll-smooth">
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
            <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-600/20">
              <h3 className="text-lg font-semibold mb-2">Chụp ảnh hiện trường</h3>
              <p className="text-blue-100 text-sm mb-6 opacity-90">
                Thư mục lưu: <strong>{config.targetFolder}/{user.username}</strong>
              </p>
              
              <button 
                onClick={triggerCamera}
                className="w-full bg-white text-blue-600 py-4 rounded-xl font-bold flex items-center justify-center text-lg hover:bg-blue-50 active:scale-95 transition-all shadow-md"
              >
                <Camera className="w-6 h-6 mr-2" />
                Chụp & Upload
              </button>
            </div>

            <div className="flex justify-between items-center mt-8 mb-4">
              <h3 className="font-bold text-slate-700">Tải lên gần đây</h3>
              <button onClick={() => setCurrentView('history')} className="text-xs text-blue-600 font-medium">Xem tất cả</button>
            </div>

            {photos.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có ảnh nào được chụp.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {photos.slice(0, 3).map((photo) => (
                  <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                    <img src={photo.previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg bg-slate-100" />
                    <div className="ml-4 flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{photo.file.name}</p>
                      
                      <div className="mt-1 flex items-center">
                        {photo.status === UploadStatus.UPLOADING && (
                          <span className="text-xs text-blue-500 flex items-center">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang tải lên...
                          </span>
                        )}
                        {photo.status === UploadStatus.SUCCESS && (
                          <span className="text-xs text-green-600 flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1" /> Đã xong
                          </span>
                        )}
                        {photo.status === UploadStatus.ERROR && (
                          <span className="text-xs text-red-500 flex items-center">
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
             {photos.map((photo) => (
              <div key={photo.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center">
                 <img src={photo.previewUrl} alt="Preview" className="w-12 h-12 object-cover rounded-lg bg-slate-100" />
                 <div className="ml-3 flex-1">
                   <p className="text-sm font-medium text-slate-800 truncate">{photo.file.name}</p>
                   <div className="flex justify-between items-center mt-1">
                     <span className={`text-xs px-2 py-0.5 rounded-full ${
                        photo.status === UploadStatus.SUCCESS ? 'bg-green-100 text-green-700' :
                        photo.status === UploadStatus.UPLOADING ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                     }`}>
                       {photo.status === UploadStatus.SUCCESS ? 'Thành công' : photo.status === UploadStatus.UPLOADING ? 'Đang xử lý' : 'Lỗi'}
                     </span>
                     <span className="text-xs text-slate-400">{photo.timestamp.toLocaleTimeString()}</span>
                   </div>
                   {photo.status === UploadStatus.ERROR && (
                     <p className="text-[10px] text-red-500 mt-1">{photo.errorMessage}</p>
                   )}
                 </div>
              </div>
            ))}
          </div>
        )}

        {currentView === 'blueprint' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-800 text-xl">Thông tin triển khai</h3>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-sm text-slate-600">
               <p>Hệ thống đang chạy ở chế độ: <strong className={config.simulateMode ? "text-orange-600" : "text-green-600"}>{config.simulateMode ? "GIẢ LẬP (Demo)" : "THỰC TẾ (Live)"}</strong></p>
               <p className="mt-2">Backend API: <code className="bg-slate-100 px-1 rounded">/api/token</code></p>
            </div>
          </div>
        )}

        {currentView === 'settings' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-800 text-xl">Cấu hình</h3>
            
            <div className="bg-white p-5 rounded-xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Chế độ giả lập (Demo)</label>
                <div 
                  className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${config.simulateMode ? 'bg-blue-600' : 'bg-slate-300'}`}
                  onClick={() => setConfig(prev => ({...prev, simulateMode: !prev.simulateMode}))}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${config.simulateMode ? 'translate-x-6' : ''}`} />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Tắt giả lập để upload thật lên OneDrive.
              </p>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-xs text-blue-800">
               Để cấu hình OneDrive thật, vui lòng thiết lập Environment Variables trên Vercel:
               <ul className="list-disc pl-4 mt-2 space-y-1">
                 <li>AZURE_CLIENT_ID</li>
                 <li>AZURE_CLIENT_SECRET</li>
                 <li>AZURE_REFRESH_TOKEN</li>
               </ul>
            </div>
          </div>
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 flex justify-around items-center py-2 pb-safe absolute bottom-0 w-full z-20">
        <TabButton active={currentView === 'camera'} onClick={() => setCurrentView('camera')} icon={<Camera />} label="Chụp ảnh" />
        <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="Lịch sử" />
        <TabButton active={currentView === 'blueprint'} onClick={() => setCurrentView('blueprint')} icon={<Info />} label="Kịch bản" />
        <TabButton active={currentView === 'settings'} onClick={() => setCurrentView('settings')} icon={<Settings />} label="Cài đặt" />
      </nav>
    </div>
  );
}

const TabButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full py-1 ${active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
  >
    <div className={`w-6 h-6 ${active ? 'fill-current' : ''}`}>
      {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: active ? 2.5 : 2 })}
    </div>
    <span className="text-[10px] font-medium mt-1">{label}</span>
  </button>
);