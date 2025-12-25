// BCT0902
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, AppConfig, VisitorRecord } from '../types';
import { fetchVisitors, updateVisitorStatus } from '../services/graphService';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from './Button';
import { 
  Users, QrCode, Loader2, Calendar, Phone, User as UserIcon, 
  MapPin, XCircle, FileSpreadsheet, FileCode, CheckCircle, Check, RefreshCw, 
  Printer, Filter, ChevronDown, Building2, Eye
} from 'lucide-react';

// @ts-ignore
import * as XLSX from 'xlsx';

interface VisitorManagerProps {
  user: User;
  usersList?: User[]; // Optional for non-admin context, but used here
  config: AppConfig;
  themeColor: string;
}

export const VisitorManager: React.FC<VisitorManagerProps> = ({ user, usersList = [], config, themeColor }) => {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorRecord | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // --- FILTER STATES ---
  // 1. Target Unit (Admin can change this)
  const [targetUnitUsername, setTargetUnitUsername] = useState(user.username);
  
  // 2. Time Filter (Changed to specific Date)
  const [viewDate, setViewDate] = useState(new Date());

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Derive month string for API fetching (Always fetch by month to get the file)
  const viewMonthStr = `${viewDate.getFullYear()}_${(viewDate.getMonth() + 1).toString().padStart(2, '0')}`;
  
  // Dynamic QR Url based on selection
  const qrUrl = `${window.location.origin}/?view=guest-visit&unit=${targetUnitUsername}&month=${viewMonthStr}`;

  // Reset target unit if user changes (logout/login)
  useEffect(() => {
      setTargetUnitUsername(user.username);
  }, [user.username]);

  useEffect(() => {
    loadVisitors();
    
    const intervalId = setInterval(() => {
        loadVisitors(true);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [targetUnitUsername, viewMonthStr]); 

  const loadVisitors = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
        // Fetch data for the selected Target Unit (Month file)
        const data = await fetchVisitors(config, targetUnitUsername, viewMonthStr);
        setVisitors(data.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()));
    } catch (e) {
        console.error(e);
        setVisitors([]);
    } finally {
        if (!silent) setIsLoading(false);
    }
  };

  // --- LOGIC LỌC DỮ LIỆU THEO NGÀY ---
  const filteredVisitors = useMemo(() => {
      return visitors.filter(v => {
          const vDate = new Date(v.visitDate);
          return vDate.getDate() === viewDate.getDate() &&
                 vDate.getMonth() === viewDate.getMonth() &&
                 vDate.getFullYear() === viewDate.getFullYear();
      });
  }, [visitors, viewDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.value) return;
      setViewDate(new Date(e.target.value));
  };

  const handleApprove = async () => {
      if (!selectedVisitor) return;
      setIsUpdating(true);
      try {
          const success = await updateVisitorStatus(config, targetUnitUsername, selectedVisitor.id, 'approved');
          if (success) {
              setVisitors(prev => prev.map(v => v.id === selectedVisitor.id ? { ...v, status: 'approved' } : v));
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

  // --- EXPORT LOGIC ---
  const getReportTitle = () => {
      const unitName = usersList.find(u => u.username === targetUnitUsername)?.displayName || targetUnitUsername;
      const timeInfo = `NGÀY ${viewDate.getDate()}/${viewDate.getMonth() + 1}/${viewDate.getFullYear()}`;
      return { unitName, timeInfo };
  };

  const exportToExcel = () => {
      try {
          const { unitName, timeInfo } = getReportTitle();
          const title = `DANH SÁCH ĐĂNG KÝ THĂM - ${unitName.toUpperCase()}`;
          const subTitle = timeInfo;
          
          const headers = ["STT", "Ngày đăng ký", "Tên quân nhân", "Đơn vị", "Người thăm", "Quan hệ", "SĐT", "Trạng thái"];
          
          const dataRows = filteredVisitors.map((v, idx) => [
              idx + 1,
              new Date(v.visitDate).toLocaleString('vi-VN'),
              v.soldierName,
              v.soldierUnit,
              v.visitorName,
              v.relationship,
              v.phone,
              v.status === 'pending' ? 'Chờ duyệt' : 'Đã duyệt'
          ]);

          const wsData = [
              [title], [subTitle], [], headers, ...dataRows
          ];

          const ws = XLSX.utils.aoa_to_sheet(wsData);
          if(!ws['!merges']) ws['!merges'] = [];
          ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });
          ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });

          ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 15 }];

          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "DanhSach");
          const dateStr = `${viewDate.getFullYear()}${viewDate.getMonth()+1}${viewDate.getDate()}`;
          XLSX.writeFile(wb, `DS_ThamThan_${targetUnitUsername}_${dateStr}.xlsx`);

      } catch (e) {
          alert("Lỗi khi xuất file Excel.");
      }
  };

  const getReportHtml = () => {
      const { unitName, timeInfo } = getReportTitle();
      return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Báo cáo thăm thân</title>
            <style>
                body { font-family: 'Times New Roman', Times, serif; padding: 20px; max-width: 1000px; margin: 0 auto; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                th, td { border: 1px solid #333; padding: 8px; text-align: left; vertical-align: middle; }
                th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
                h2 { text-align: center; color: #000; margin-bottom: 5px; text-transform: uppercase; font-size: 18px; }
                h3 { text-align: center; color: #333; margin-top: 0; font-size: 16px; font-weight: normal; }
                .meta { text-align: center; font-size: 14px; color: #333; margin-bottom: 20px; font-style: italic; }
                .status-pending { color: #d97706; font-weight: bold; }
                .status-approved { color: #059669; font-weight: bold; }
                .footer { margin-top: 40px; display: flex; justify-content: space-between; text-align: center; padding: 0 50px; }
                .footer div { font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>THỐNG KÊ DANH SÁCH ĐĂNG KÝ THĂM THÂN NHÂN</h2>
            <h3>Đơn vị: ${unitName.toUpperCase()}</h3>
            <div class="meta">(${timeInfo})</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px">STT</th>
                        <th style="width: 140px">Thời gian</th>
                        <th>Tên quân nhân</th>
                        <th>Người thăm</th>
                        <th>Quan hệ</th>
                        <th>SĐT</th>
                        <th style="width: 100px">Trạng thái</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredVisitors.length > 0 ? filteredVisitors.map((v, idx) => `
                        <tr>
                            <td style="text-align: center">${idx + 1}</td>
                            <td>${new Date(v.visitDate).toLocaleString('vi-VN')}</td>
                            <td>${v.soldierName}</td>
                            <td>${v.visitorName}</td>
                            <td style="text-align: center">${v.relationship}</td>
                            <td style="text-align: center">${v.phone}</td>
                            <td style="text-align: center" class="${v.status === 'pending' ? 'status-pending' : 'status-approved'}">
                                ${v.status === 'pending' ? 'Chờ duyệt' : 'Đã duyệt'}
                            </td>
                        </tr>
                    `).join('') : `<tr><td colspan="7" style="text-align:center; padding: 20px">Không có dữ liệu</td></tr>`}
                </tbody>
            </table>
            <div class="footer">
                <div></div>
                <div>
                    <p>Ngày ...... tháng ...... năm ......</p>
                    <p>NGƯỜI LẬP BIỂU</p>
                    <br><br><br>
                </div>
            </div>
        </body>
        </html>
      `;
  };

  const exportToHtml = () => {
      const htmlContent = getReportHtml();
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `BaoCao_${targetUnitUsername}.html`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handlePrint = () => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.print();
      }
  };

  return (
    <div className="space-y-6">
        {/* ADMIN SELECTOR */}
        {user.role === 'admin' && (
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                    <p className="text-xs font-bold text-indigo-800 uppercase mb-1">Đang xem dữ liệu của:</p>
                    <div className="relative">
                        <select 
                            className="w-full p-2 pr-8 rounded-lg border border-indigo-200 text-sm font-medium bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                            value={targetUnitUsername}
                            onChange={(e) => setTargetUnitUsername(e.target.value)}
                        >
                            {usersList.map(u => (
                                <option key={u.id} value={u.username}>
                                    {u.displayName} ({u.unit})
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                </div>
            </div>
        )}

        {/* Header Section with QR */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 flex items-center mb-4">
                <Users className="w-6 h-6 mr-2" style={{ color: themeColor }} />
                Quản lý đăng ký thăm
            </h3>
            
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-100">
                <div 
                    className="bg-white p-3 rounded-xl shadow-md cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    onClick={() => setShowQRModal(true)}
                >
                    <QRCodeCanvas value={qrUrl} size={120} />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-700 uppercase">
                    QR Đăng ký - Tháng {viewDate.getMonth() + 1}
                </p>
                <div className="text-xs text-slate-500 text-center mt-1 max-w-xs space-y-1">
                    <p>Năm {viewDate.getFullYear()} • Đơn vị: {targetUnitUsername}</p>
                    <p className="italic text-emerald-600 font-medium">Chạm vào mã để phóng to & tải về</p>
                </div>
            </div>
        </div>

        {/* Visitors List with Advanced Filter */}
        <div>
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm mb-4 space-y-4">
                 {/* Row 1: Title & Refresh */}
                 <div className="flex items-center justify-between">
                     <h4 className="font-bold text-slate-700 flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                        Danh sách ({filteredVisitors.length})
                    </h4>
                    <button 
                        onClick={() => loadVisitors()} 
                        className={`p-1.5 rounded-full hover:bg-slate-100 text-slate-500 ${isLoading ? 'animate-spin' : ''}`}
                        title="Làm mới"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                 </div>

                 {/* Row 2: Day Filter */}
                 <div>
                    <div className="relative">
                        <input 
                            type="date" 
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 bg-white"
                            value={viewDate.toISOString().split('T')[0]}
                            onChange={handleDateChange}
                        />
                    </div>
                 </div>
                 
                 {/* Row 3: Actions */}
                 <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                    <button onClick={() => setShowReportModal(true)} className="px-3 py-1.5 text-blue-600 bg-blue-50 rounded-lg text-xs font-bold hover:bg-blue-100 flex items-center">
                        <Eye className="w-3 h-3 mr-1" /> Xem
                    </button>
                    <button onClick={exportToHtml} className="px-3 py-1.5 text-orange-600 bg-orange-50 rounded-lg text-xs font-bold hover:bg-orange-100 flex items-center">
                        <FileCode className="w-3 h-3 mr-1" /> HTML
                    </button>
                    <button onClick={exportToExcel} className="px-3 py-1.5 text-green-600 bg-green-50 rounded-lg text-xs font-bold hover:bg-green-100 flex items-center">
                        <FileSpreadsheet className="w-3 h-3 mr-1" /> Excel
                    </button>
                 </div>
            </div>

            {isLoading ? (
                <div className="text-center py-10 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Đang tải dữ liệu...</div>
            ) : filteredVisitors.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p>Không có dữ liệu ngày {viewDate.toLocaleDateString('vi-VN')}.</p>
                    <p className="text-xs mt-1">Vui lòng chọn ngày khác.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredVisitors.map((v) => (
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
                                    <span className="text-[10px] text-slate-400">{new Date(v.visitDate).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
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
                    <p className="text-slate-500 text-sm">{targetUnitUsername}</p>
                    <div className="text-center mt-2">
                        <p className="text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full text-sm">Tháng {viewDate.getMonth() + 1}/{viewDate.getFullYear()}</p>
                    </div>
                </div>
            </div>
        )}
        
        {/* REPORT PREVIEW MODAL */}
        {showReportModal && (
            <div className="fixed inset-0 z-[90] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full h-full max-w-5xl rounded-xl flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
                    {/* Toolbar */}
                    <div className="flex justify-between items-center p-3 border-b border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">Xem trước Báo cáo</span>
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">HTML</span>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handlePrint}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                            >
                                <Printer className="w-4 h-4" />
                                In
                            </button>
                            <button 
                                onClick={() => setShowReportModal(false)}
                                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 bg-slate-100 p-0 sm:p-4 overflow-hidden">
                        <div className="h-full w-full bg-white shadow-sm sm:rounded-lg overflow-hidden mx-auto max-w-4xl border border-slate-200">
                            <iframe 
                                ref={iframeRef}
                                srcDoc={getReportHtml()}
                                className="w-full h-full border-0"
                                title="Report Preview"
                            />
                        </div>
                    </div>
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