
import { User } from '../types';

// Simple obfuscation to hide the plain text password in the source code
// "cntt@302" encoded in Base64 is "Y250dEAzMDI="
const ADMIN_SECRET = atob('Y250dEAzMDI=');

// Danh sách tài khoản mặc định (Fallback khi chưa có file trên Cloud)
export const INITIAL_USERS: User[] = [
  { 
    id: 'admin_master', 
    username: 'admin', 
    password: ADMIN_SECRET, 
    role: 'admin', 
    displayName: 'Quản Trị Hệ Thống', 
    unit: 'Bo_chi_huy' 
  },
  { 
    id: 'admin_backup', 
    username: 'admin2', 
    password: ADMIN_SECRET, 
    role: 'admin', 
    displayName: 'Admin Dự Phòng', 
    unit: 'Bo_chi_huy' 
  },
];

// Hàm login (Validation local)
export const login = async (username: string, password: string, userList: User[]): Promise<User | null> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  const user = userList.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  return user || null;
};
