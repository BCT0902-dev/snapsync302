import React, { useState, useEffect } from 'react';
import { QRCodeLog } from './types';
import { ExternalLink, Trash2 } from 'lucide-react';
import { fetchQRCodeLogs, deleteQRCodeLog } from './services/graphService';

export default function App() {
  const [qrLogs, setQrLogs] = useState<QRCodeLog[]>([]);
  // Placeholder for missing configuration and loading state
  const config = { oneDriveToken: '', targetFolder: '', simulateMode: false };

  useEffect(() => {
    // Basic load effect
    fetchQRCodeLogs(config).then(setQrLogs);
  }, []);

  const handleDeleteQRLog = async (id: string) => {
    await deleteQRCodeLog(config, id);
    fetchQRCodeLogs(config).then(setQrLogs);
  };

  return (
    <div className="p-4 bg-slate-100 min-h-screen">
      <div className="max-w-md mx-auto bg-white shadow rounded-lg p-4">
        <h1 className="text-xl font-bold mb-4">Quản lý QR</h1>
        {qrLogs.length === 0 ? (
            <div className="text-center text-slate-500 py-4">Không có logs</div>
        ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {qrLogs.map(log => (
                    <div key={log.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs flex justify-between items-start group hover:border-slate-300 transition-colors">
                        <div className="min-w-0 pr-2">
                            <p className="font-bold text-slate-700 truncate">{log.fileName}</p>
                            <p className="text-slate-500 mt-0.5">Tạo bởi: {log.createdBy}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                                {new Date(log.createdDate).toLocaleString('vi-VN')}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <a 
                                href={log.link} 
                                target="_blank" 
                                rel="noreferrer"
                                className="p-1.5 bg-white border border-slate-200 rounded text-blue-600 hover:bg-blue-50"
                                title="Mở link"
                            >
                                <ExternalLink className="w-3 h-3" />
                            </a>
                            <button 
                                onClick={() => handleDeleteQRLog(log.id)}
                                className="p-1.5 bg-white border border-slate-200 rounded text-red-500 hover:bg-red-50 hover:border-red-200"
                                title="Xóa log"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
}