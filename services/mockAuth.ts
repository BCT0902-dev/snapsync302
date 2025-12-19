import { User } from '../types';

// Danh sách tài khoản giả lập (admin tạo sẵn)
const MOCK_USERS: User[] = [
  { id: '1', username: 'canbo1', role: 'staff', displayName: 'Nguyễn Văn A' },
  { id: '2', username: 'canbo2', role: 'staff', displayName: 'Trần Thị B' },
  { id: '3', username: 'admin', role: 'admin', displayName: 'Quản Trị Viên' },
];

export const login = async (username: string, password: string): Promise<User | null> => {
  // Giả lập độ trễ mạng
  await new Promise(resolve => setTimeout(resolve, 800));

  // Trong thực tế, password sẽ được hash và check từ server
  // Ở đây demo: password mặc định là "123456" cho mọi user
  if (password === '123456') {
    const user = MOCK_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
    return user || null;
  }
  return null;
};