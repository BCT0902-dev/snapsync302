
export interface User {
  id: string;
  username: string;
  password?: string; // Lưu pass để hiển thị trong phần quản lý (Demo)
  role: 'admin' | 'staff';
  displayName: string;
  unit: string; // Đơn vị công tác
  status?: 'active' | 'pending'; // Trạng thái tài khoản
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
