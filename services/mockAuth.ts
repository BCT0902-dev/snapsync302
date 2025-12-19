
import { User } from '../types';

// Danh sách tài khoản mặc định
export const INITIAL_USERS: User[] = [
  { id: '1', username: 'cb1', password: '123', role: 'staff', displayName: 'Nguyễn Văn A', unit: 'Trung_doi_1' },
  { id: '2', username: 'cb2', password: '123', role: 'staff', displayName: 'Trần Thị B', unit: 'Dai_doi_2' },
  { id: '3', username: 'admin', password: 'admin', role: 'admin', displayName: 'Quản Trị Hệ Thống', unit: 'Bo_chi_huy' },
];

// Hàm login giả lập (trong thực tế sẽ gọi API)
export const login = async (username: string, password: string, userList: User[]): Promise<User | null> => {
  await new Promise(resolve => setTimeout(resolve, 500)); // Delay nhẹ

  const user = userList.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  return user || null;
};