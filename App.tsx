
import React, { useState, useEffect } from 'react';
import { User, AppConfig, SystemConfig, CloudItem, SystemStats } from './types';
import { login, INITIAL_USERS } from './services/mockAuth';
import { 
  fetchUsersFromOneDrive, fetchSystemConfig, DEFAULT_SYSTEM_CONFIG, 
  fetchSystemStats
} from './services/graphService';
import { Button } from './components/Button';
import { VisitorManager } from './components/VisitorManager';
import { VisitorForm } from './components/VisitorForm';
import { LogIn, Users, Shield, Loader2, Image, LogOut } from 'lucide-react';
import { Album } from './components/Album';
import { Statistics } from './components/Statistics';

const App: React.FC = () => {
    // --- STATE ---
    const [user, setUser] = useState<User | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isInit, setIsInit] = useState(true);

    const [config, setConfig] = useState<AppConfig>({
        oneDriveToken: '',
        targetFolder: 'F302_App_Data',
        simulateMode: false
    });
    const [systemConfig, setSystemConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
    const [usersList, setUsersList] = useState<User[]>(INITIAL_USERS);
    
    // View state
    const [currentView, setCurrentView] = useState<'gallery' | 'visitor-manager'>('gallery');
    const [stats, setStats] = useState<SystemStats>({ totalUsers: 0, activeUsers: 0, totalFiles: 0, totalStorage: 0 });

    // URL Handling for Public Visitor Form
    const searchParams = new URLSearchParams(window.location.search);
    const publicView = searchParams.get('view');
    const publicUnit = searchParams.get('unit');
    const publicMonth = searchParams.get('month');

    // --- EFFECTS ---

    useEffect(() => {
        const init = async () => {
            // Check if this is a public visitor form request first
            if (publicView === 'guest-visit' && publicUnit && publicMonth) {
                setIsInit(false);
                return;
            }

            try {
                // Try to load config from OneDrive if we had a token (skip for now as we login first)
                // In a real app we might check for stored token
                
                // For now, just simulate loading users from mock/cache
                // const users = await fetchUsersFromOneDrive(config); 
                // setUsersList(users);
                
                // Load System Config
                const sysConf = await fetchSystemConfig(config);
                setSystemConfig(sysConf);

                // Update document title/style
                document.title = sysConf.appName;
            } catch (e) {
                console.error("Init error", e);
            } finally {
                setIsInit(false);
            }
        };
        init();
    }, []);

    // Fetch Stats when user logs in
    useEffect(() => {
        if (user) {
            fetchSystemStats(config).then(setStats);
            // Fetch latest users list when admin logs in
            if (user.role === 'admin') {
                fetchUsersFromOneDrive(config).then(setUsersList);
            }
        }
    }, [user]);

    // --- HANDLERS ---

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            // First try to authenticate against loaded usersList (or INITIAL if fail)
            const loggedUser = await login(username, password, usersList);
            if (loggedUser) {
                setUser(loggedUser);
                // Update config if user has specific settings? 
            } else {
                alert("Tên đăng nhập hoặc mật khẩu không đúng.");
            }
        } catch (error) {
            console.error(error);
            alert("Lỗi đăng nhập.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        setUser(null);
        setUsername('');
        setPassword('');
        setCurrentView('gallery');
    };

    // Public View: Visitor Registration Form
    if (publicView === 'guest-visit' && publicUnit && publicMonth) {
        return (
            <VisitorForm 
                unitCode={publicUnit}
                monthStr={publicMonth}
                config={config}
                onSuccess={() => window.location.href = window.location.pathname} // Reload to clear params or go home
                onCancel={() => window.location.href = window.location.pathname}
            />
        );
    }

    if (isInit) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
        );
    }

    // Login View
    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                            <Shield className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">{systemConfig.appName}</h1>
                        <p className="text-slate-500 text-sm mt-2">Cổng thông tin nội bộ</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tên đăng nhập</label>
                            <input 
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="Nhập username"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
                            <input 
                                type="password"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Nhập mật khẩu"
                            />
                        </div>
                        <Button 
                            type="submit" 
                            className="w-full py-3 rounded-xl shadow-lg shadow-emerald-200 mt-2"
                            isLoading={isLoading}
                        >
                            <LogIn className="w-5 h-5 mr-2" />
                            Đăng nhập
                        </Button>
                    </form>
                    <div className="mt-8 text-center text-xs text-slate-400">
                        &copy; 2024 F302 - CNTT
                    </div>
                </div>
            </div>
        );
    }

    // Main App View
    const isGuest = user.role === 'staff' && user.username === 'thannhan'; // Determine if user is guest/restricted

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                        <Shield className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="font-bold text-slate-800 leading-tight">{systemConfig.appName}</h1>
                        <p className="text-xs text-slate-500 font-medium">{user.displayName}</p>
                    </div>
                </div>
                <Button variant="ghost" onClick={handleLogout} className="text-slate-500 hover:text-red-500">
                    <LogOut className="w-5 h-5" />
                </Button>
            </header>

            {/* Navigation */}
            <div className="px-4 py-2 bg-white border-b border-slate-100 flex gap-2 overflow-x-auto">
                <button 
                    onClick={() => setCurrentView('gallery')}
                    className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${currentView === 'gallery' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <Image className="w-4 h-4 mr-2" />
                    Thư viện
                </button>
                {!isGuest && (
                    <button 
                        onClick={() => setCurrentView('visitor-manager')}
                        className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${currentView === 'visitor-manager' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Users className="w-4 h-4 mr-2" />
                        Quản lý khách
                    </button>
                )}
            </div>

            {/* Content */}
            <main className="flex-1 p-4 max-w-7xl mx-auto w-full">
                {currentView === 'gallery' && (
                    <div className="space-y-6">
                        <Statistics stats={stats} isLoading={false} color={systemConfig.themeColor} />
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-700 mb-4 flex items-center">
                                <Image className="w-5 h-5 mr-2 text-emerald-600" />
                                Hình ảnh gần đây
                            </h3>
                            {/* Pass mock items or fetch real ones */}
                            <Album items={[]} color={systemConfig.themeColor} currentUser={user} isAdmin={user.role === 'admin'} />
                        </div>
                    </div>
                )}

                {/* --- VISITOR MANAGEMENT VIEW --- */}
                {currentView === 'visitor-manager' && !isGuest && (
                    <VisitorManager 
                        user={user}
                        usersList={usersList} // Pass full list for Admin selector
                        config={config}
                        themeColor={systemConfig.themeColor}
                    />
                )}
            </main>
        </div>
    );
};

export default App;
