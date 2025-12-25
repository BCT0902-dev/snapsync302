// BCT0902
import { User } from '../types';

// Simple obfuscation to hide the plain text password in the source code
// "cntt@302" encoded in Base64 is "Y250dEAzMDI="
const ADMIN_SECRET = atob('Y250dEAzMDI=');

// "thannhan302" encoded in Base64 is "dGhhbm5oYW4zMDI="
const THANNHAN_SECRET = atob('dGhhbm5oYW4zMDI=');

// Danh sách tài khoản mặc định (Fallback khi chưa có file trên Cloud)
export const INITIAL_USERS: User[] = [
  { 
    id: 'admin_master', 
    username: 'admin', 
    password: ADMIN_SECRET, 
    role: 'admin', 
    displayName: 'Quản Trị Hệ Thống', 
    unit: 'Quan_tri_vien',
    status: 'active'
  },
  { 
    id: 'admin_backup', 
    username: 'admin2', 
    password: ADMIN_SECRET, 
    role: 'admin', 
    displayName: 'Admin Dự Phòng', 
    unit: 'Quan_tri_vien',
    status: 'active'
  },
  {
    id: 'guest_thannhan',
    username: 'thannhan',
    password: THANNHAN_SECRET,
    role: 'staff', // Dùng role staff nhưng sẽ giới hạn hiển thị trong App.tsx
    displayName: 'Thân Nhân / Khách',
    unit: 'Khach_tham_quan',
    status: 'active'
  }
];

// Hàm login (Validation local)
export const login = async (username: string, password: string, userList: User[]): Promise<User | null> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  const user = userList.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  return user || null;
};