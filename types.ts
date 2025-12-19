export interface User {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  displayName: string;
}

export enum UploadStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface PhotoRecord {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  uploadedUrl?: string;
  timestamp: Date;
  errorMessage?: string;
}

export interface AppConfig {
  oneDriveToken: string; // In a real app, this comes from OAuth flow
  targetFolder: string;
  simulateMode: boolean;
}