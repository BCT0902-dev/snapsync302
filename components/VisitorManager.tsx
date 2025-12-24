
import React, { useState, useEffect, useRef } from 'react';
import { User, AppConfig, VisitorRecord } from '../types';
import { fetchVisitors, updateVisitorStatus } from '../services/graphService';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from './Button';
import { 
  Users, QrCode, Download, Loader2, Calendar, Phone, User as UserIcon, 
  MapPin, XCircle, FileSpreadsheet, FileCode, CheckCircle, Check, RefreshCw
} from 'lucide-react';

// @ts-ignore
import * as XLSX from 'xlsx';

interface VisitorManagerProps {
  user: User;
  config: AppConfig;
  themeColor: string;
}

export const VisitorManager: React.FC<VisitorManagerProps> = ({ user, config, themeColor }) => {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorRecord | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Generate current month string for data fetching (YYYY_MM)
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}_${(today.getMonth() + 1).toString().padStart(2, '0')}`;
  
  // URL for QR Code (Simulated)
  // In real app, this should be the deployed URL
  const qrUrl = `${window.location.origin}/?view=guest-visit&unit=${user.username}&month=${currentMonthStr}`;

  useEffect(() => {
    loadVisitors();
    
    // Auto refresh every 30 seconds
    const intervalId = setInterval(() => {
        loadVisitors(true); // silent reload
    }, 30000);

    return () => clearInterval(intervalId);
  }, [user.username]);

  const loadVisitors = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
        const data = await fetchVisitors(config, user.username, currentMonthStr);
        // Sort by date desc
        setVisitors(data.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()));
    } catch (e) {
        console.error(e);
    } finally {
        if (!silent) setIsLoading(false);
    }
  };

  const handleApprove = async () => {
      if (!selectedVisitor) return;
      setIsUpdating(true);
      try {
          const success = await updateVisitorStatus(config, user.username, selectedVisitor.id, 'approved');
          if (success) {
              // Update local state
              setVisitors(prev => prev.map(v => v.id === selectedVisitor.id ? { ...v, status: 'approved' } : v));
              // Update selected visitor view
              setSelectedVisitor(prev => prev ? { ...prev, status: 'approved' } : null);
              alert("Đã duyệt thành công!");
          } else {
              alert("Lỗi khi duyệt, vui lòng thử lại.");
          }
      } catch (e) {
          console.error(e);
          alert("Lỗi hệ thống.");
      } finally {
          setIsUpdating(false);
      }
  };

  const exportToExcel = () => {
      try {
          // Prepare Data
          const title = `THỐNG KÊ DANH SÁCH ĐĂNG KÝ THĂM THÂN NHÂN ${user.unit.toUpperCase()}`;
          const dateInfo = `Ngày tháng: Tháng ${today.getMonth() + 1}/${today.getFullYear()}`;
          
          const headers = ["STT", "Ngày đăng ký", "Tên quân nhân", "Đơn vị", "Người thăm", "Quan hệ", "SĐT", "Trạng thái"];
          
          const dataRows = visitors.map((v, idx) => [
              idx + 1,
              new Date(v.visitDate).toLocaleString('vi-VN'),
              v.soldierName,
              v.soldierUnit,
              v.visitorName,
              v.relationship,
              v.phone,
              v.status === 'pending' ? 'Chờ duyệt' : 'Đã duyệt'
          ]);

          // Combine into a worksheet data array (Array of Arrays)
          const wsData = [
              [title],           // Row 1: Title
              [dateInfo],        // Row 2: Date
              [],                // Row 3: Empty
              headers,           // Row 4: Headers
              ...dataRows        // Row 5+: Data
          ];

          // Create Worksheet
          const ws = XLSX.utils.aoa_to_sheet(wsData);

          // Merge Title Cells (A1:H1) and Date Cells (A2:H2)
          if(!ws['!merges']) ws['!merges'] = [];
          ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });
          ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });

          // Set Column Widths (Optional but good for UX)
          ws['!cols'] = [
              { wch: 5 },  // STT
              { wch: 20 }, // Time
              { wch: 20 }, // Soldier
              { wch: 20 }, // Unit
              { wch: 20 }, // Visitor
              { wch: 10 }, // Relation
              { wch: 15 }, // Phone
              { wch: 15 }  // Status
          ];

          // Create Workbook and append sheet
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "DanhSach");

          // Write file
          const fileName = `DS_ThamThan_${user.username}_${currentMonthStr}.xlsx`;
          XLSX.writeFile(wb, fileName);

      } catch (e) {
          console.error("Export Excel Error:", e);
          alert("Lỗi khi xuất file Excel. Vui lòng thử lại.");
      }
  };

  const exportToHtml = () => {
      const htmlContent = `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                h2 { text-align: center; color: #059669; }
                .meta { text-align: center; font-size: 0.9em; color: #666; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h2>THỐNG KÊ DANH SÁCH ĐĂNG KÝ THĂM THÂN NHÂN</h2>
            <div class="meta">
                Đơn vị: ${user.unit} (User: ${user.username})<br/>
                Tháng: ${currentMonthStr.replace('_', '/')}<br/>
                Ngày xuất: ${new Date().toLocaleString('vi-VN')}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>STT</th>
                        <th>Thời gian</th>
                        <th>Tên quân nhân</th>
                        <th>Người thăm</th>
                        <th>Quan hệ</th>
                        <th>SĐT</th>
                        <th>Trạng thái</th>
                    </tr>
                </thead>
                <tbody>
                    ${visitors.map((v, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${new Date(v.visitDate).toLocaleString('vi-VN')}</td>
                            <td>${v.soldierName}</td>
                            <td>${v.visitorName}</td>
                            <td>${v.relationship}</td>
                            <td>${v.phone}</td>
                            <td>${v.status === 'pending' ? 'Chờ duyệt' : 'Đã duyệt'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `BaoCao_ThamThan_${user.username}.html`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
        {/* Header Section with QR */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 flex items-center mb-4">
                <Users className="w-6 h-6 mr-2" style={{ color: themeColor }} />
                Quản lý đăng ký thăm quân nhân
            </h3>
            
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-100">
                <div 
                    className="bg-white p-3 rounded-xl shadow-md cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    onClick={() => setShowQRModal(true)}
                >
                    <QRCodeCanvas value={qrUrl} size={120} />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-700">Mã QR Đăng ký (Tháng {today.getMonth() + 1})</p>
                <p className="text-xs text-slate-500 text-center mt-1 max-w-xs">
                    Chạm vào mã để phóng to. Khách quét mã này để điền form đăng ký.
                </p>
                
                {/* Simulation Button for Demo */}
                <a 
                    href={qrUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="mt-4 text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full font-bold hover:bg-blue-100 border border-blue-200"
                >
                    Mô phỏng Khách quét QR
                </a>
            </div>
        </div>

        {/* Visitors List */}
        <div>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-700 flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                        Danh sách ({visitors.length})
                    </h4>
                    <button 
                        onClick={() => loadVisitors()} 
                        className={`p-1.5 rounded-full hover:bg-slate-100 text-slate-500 ${isLoading ? 'animate-spin' : ''}`}
                        title="Làm mới"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex gap-2">
                    <button onClick={exportToHtml} className="p-2 text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100" title="Xuất HTML">
                        <FileCode className="w-4 h-4" />
                    </button>
                    <button onClick={exportToExcel} className="p-2 text-green-600 bg-green-50 rounded-lg hover:bg-green-100" title="Xuất Excel (.xlsx)">
                        <FileSpreadsheet className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-10 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Đang tải dữ liệu...</div>
            ) : visitors.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Chưa có lượt đăng ký nào trong tháng này.
                </div>
            ) : (
                <div className="space-y-3">
                    {visitors.map((v) => (
                        <div 
                            key={v.id} 
                            onClick={() => setSelectedVisitor(v)}
                            className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between active:scale-[0.99] transition-transform cursor-pointer hover:border-emerald-200"
                        >
                            <div className="min-w-0">
                                <p className="font-bold text-slate-800 text-sm">{v.visitorName}</p>
                                <p className="text-xs text-slate-500 mt-0.5">Thăm: <span className="font-medium text-slate-700">{v.soldierName}</span></p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{v.relationship}</span>
                                    <span className="text-[10px] text-slate-400">{new Date(v.visitDate).toLocaleDateString('vi-VN')}</span>
                                </div>
                            </div>
                            <div className="flex items-center pl-2">
                                {v.status === 'approved' ? (
                                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-green-600" />
                                    </div>
                                ) : (
                                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* QR Modal */}
        {showQRModal && (
            <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setShowQRModal(false)}>
                <div className="bg-white p-8 rounded-3xl flex flex-col items-center animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <QRCodeCanvas value={qrUrl} size={280} />
                    <p className="mt-6 font-bold text-lg text-slate-800">Quét để đăng ký</p>
                    <p className="text-slate-500 text-sm">{user.unit}</p>
                </div>
            </div>
        )}

        {/* Detail Modal */}
        {selectedVisitor && (
            <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => setSelectedVisitor(null)}>
                <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-2xl p-6 animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-start mb-6">
                        <h3 className="text-xl font-bold text-slate-800">Thông tin chi tiết</h3>
                        <button onClick={() => setSelectedVisitor(null)}><XCircle className="w-6 h-6 text-slate-400" /></button>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-xl">
                            <p className="text-xs font-bold text-slate-400 uppercase mb-2">Người đăng ký</p>
                            <div className="flex items-center mb-2">
                                <UserIcon className="w-5 h-5 text-emerald-600 mr-3" />
                                <span className="font-bold text-lg text-slate-800">{selectedVisitor.visitorName}</span>
                            </div>
                            <div className="flex items-center mb-2 text-sm text-slate-600">
                                <Phone className="w-4 h-4 mr-3 text-slate-400" />
                                <a href={`tel:${selectedVisitor.phone}`} className="hover:underline text-blue-600">{selectedVisitor.phone}</a>
                            </div>
                            <div className="flex items-center text-sm text-slate-600">
                                <Users className="w-4 h-4 mr-3 text-slate-400" />
                                <span>Quan hệ: {selectedVisitor.relationship}</span>
                            </div>
                        </div>

                        <div className="p-2">
                            <p className="text-xs font-bold text-slate-400 uppercase mb-2">Thăm quân nhân</p>
                            <p className="text-base font-medium text-slate-800 mb-1">{selectedVisitor.soldierName}</p>
                            <div className="flex items-start text-sm text-slate-500">
                                <MapPin className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                                <span>{selectedVisitor.soldierUnit}</span>
                            </div>
                        </div>
                        
                        <div className="border-t border-slate-100 pt-4 flex flex-col items-center">
                            <span className="text-xs text-slate-400 mb-4">
                                Đăng ký lúc: {new Date(selectedVisitor.visitDate).toLocaleString('vi-VN')}
                            </span>
                            
                            {selectedVisitor.status === 'pending' ? (
                                <Button 
                                    className="w-full rounded-xl py-3 shadow-lg shadow-emerald-200" 
                                    style={{ backgroundColor: themeColor }}
                                    onClick={handleApprove}
                                    isLoading={isUpdating}
                                >
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    Duyệt đăng ký
                                </Button>
                            ) : (
                                <div className="flex items-center text-green-600 font-bold bg-green-50 px-4 py-2 rounded-lg">
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    Đã duyệt
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
