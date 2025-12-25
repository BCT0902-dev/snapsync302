
export interface User {
  id: string;
  username: string;
  password?: string; // Lưu pass để hiển thị trong phần quản lý (Demo)
  role: 'admin' | 'staff';
  displayName: string;
  unit: string; // Đơn vị công tác
  status?: 'active' | 'pending'; // Trạng thái tài khoản
  allowedPaths?: string[]; // Danh sách tên thư mục/đơn vị khác được phép xem
  // Thống kê sử dụng (Optional - được tính toán runtime)
  usageStats?: {
    fileCount: number;
    totalSize: number;
  };
}

export enum UploadStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface PhotoRecord {
  id: string;
  file?: File; // Optional vì file load từ cloud sẽ không có blob local
  fileName: string; // Tên file
  previewUrl?: string;
  status: UploadStatus;
  uploadedUrl?: string; // WebUrl từ OneDrive
  timestamp: Date;
  errorMessage?: string;
  size?: number;
  mimeType?: string; // Thêm mimeType để nhận biết video/ảnh
  progress?: number; // % Tiến trình upload (0-100)
  deletedDate?: Date; // Cho lịch sử xóa
  views?: number; // Mock view count
  downloads?: number; // Mock download count
}

export interface AppConfig {
  oneDriveToken: string;
  targetFolder: string;
  simulateMode: boolean;
}

export interface SystemConfig {
  appName: string;
  logoUrl: string;
  themeColor: string; // Hex code
}

// Type mới cho item trong Gallery (Cloud Item)
export interface CloudItem {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  webUrl: string;
  lastModifiedDateTime: string;
  size: number;
  thumbnailUrl?: string; // Link ảnh thumb mặc định (thường là medium)
  mediumUrl?: string;    // Thumb kích thước trung bình (cho Grid)
  largeUrl?: string;     // Thumb kích thước lớn (cho Full View preview)
  downloadUrl?: string; // Link tải trực tiếp (@microsoft.graph.downloadUrl)
  views?: number;
  downloads?: number;
}

export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  totalStorage: number; // Bytes
}

export interface QRCodeLog {
  id: string;
  fileId: string;
  fileName: string;
  createdBy: string;
  createdDate: string; // ISO String
  link: string;
}

export interface VisitorRecord {
  id: string;
  soldierName: string;
  soldierUnit: string;
  visitorName: string;
  relationship: string;
  phone: string;
  visitDate: string; // ISO String
  status: 'pending' | 'approved' | 'completed';
}
