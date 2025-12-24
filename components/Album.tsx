
import React, { useState, useEffect } from 'react';
import { CloudItem, User } from '../types';
import { Loader2, X, ChevronLeft, ChevronRight, Download, File as FileIcon, PlayCircle, Trash2, CheckSquare, Square, Eye, Share2, QrCode } from 'lucide-react';
import { getAccessToken } from '../services/graphService';

interface AlbumProps {
  items: CloudItem[];
  color: string;
  isAdmin?: boolean;
  currentUser?: User | null;
  onDelete?: (item: CloudItem) => void;
  isSelectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onShare?: (item: CloudItem) => void;
  onQR?: (item: CloudItem) => void;
}

// --- SUB COMPONENT: GALLERY ITEM (Lưới ảnh) ---
const GalleryItem = ({ item, isSelected, onToggleSelect, onClick }: { 
    item: CloudItem, 
    isSelected: boolean, 
    onToggleSelect?: (id: string) => void,
    onClick: (item: CloudItem) => void
}) => {
    // FIX: Ưu tiên Large URL để ảnh lưới nét hơn (Medium quá nhỏ cho màn hình HD)
    const initialSrc = item.largeUrl || item.mediumUrl || item.thumbnailUrl || item.downloadUrl;
    const [src, setSrc] = useState<string | undefined>(initialSrc);
    const [isRetrying, setIsRetrying] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setSrc(item.largeUrl || item.mediumUrl || item.thumbnailUrl || item.downloadUrl);
        setHasError(false);
        setIsRetrying(false);
    }, [item]);

    const handleLoadError = async () => {
        if (isRetrying || !item.downloadUrl) {
            setHasError(true);
            return;
        }
        
        // Fallback: Nếu thumbnail lỗi, thử tải file gốc
        setIsRetrying(true);
        try {
            // Logic mới: Kiểm tra nếu là link Graph API thì cần token, ngược lại (OneDrive public link) thì KHÔNG được gửi token
            const needsToken = item.downloadUrl.includes('graph.microsoft.com');
            // FIX TS ERROR: Khai báo rõ kiểu Record<string, string>
            const headers: Record<string, string> = {};
            if (needsToken) {
                headers['Authorization'] = `Bearer ${await getAccessToken()}`;
            }

            const res = await fetch(item.downloadUrl, { headers });
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                setSrc(blobUrl);
            } else {
                setHasError(true);
            }
        } catch (e) {
            setHasError(true);
        } finally {
            setIsRetrying(false);
        }
    };

    return (
        <div 
            className={`aspect-square relative overflow-hidden bg-slate-100 cursor-pointer border border-slate-200 rounded-lg ${isSelected ? 'ring-4 ring-emerald-500 z-10' : ''}`}
            onClick={() => onClick(item)}
        >
            {!hasError && src ? (
                <>
                    <img 
                        src={src} 
                        alt={item.name} 
                        className={`w-full h-full object-cover transition-transform duration-500 hover:scale-110 ${isRetrying ? 'opacity-50' : 'opacity-100'}`} 
                        loading="lazy"
                        onError={handleLoadError}
                    />
                    {isRetrying && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                        </div>
                    )}
                </>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-1 bg-slate-50">
                    <FileIcon className="w-8 h-8 mb-1 opacity-50" />
                    <span className="text-[9px] truncate w-full text-center px-1">{item.name}</span>
                </div>
            )}
            
            {item.file?.mimeType?.startsWith('video/') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <PlayCircle className="w-8 h-8 text-white opacity-80" />
                </div>
            )}

            {onToggleSelect && (
                <div 
                    className="absolute top-0 right-0 p-2 z-20" 
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
                >
                    <div className={`rounded-md shadow-sm backdrop-blur-sm ${isSelected ? 'bg-emerald-500 text-white' : 'bg-black/40 text-white/80 hover:bg-black/60'}`}>
                    {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </div>
                </div>
            )}
            
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/60 to-transparent p-1 pt-4 flex items-center justify-between text-[9px] text-white/90 pointer-events-none">
                <span className="pl-1 truncate max-w-[70%]">{item.name}</span>
            </div>
        </div>
    );
};

export const Album: React.FC<AlbumProps> = ({ 
    items, color, isAdmin = false, currentUser, onDelete,
    isSelectionMode = false, selectedIds, onToggleSelect,
    onShare, onQR
}) => {
  const [selectedItem, setSelectedItem] = useState<CloudItem | null>(null);
  
  // States cho Full View Modal
  const [fullViewSrc, setFullViewSrc] = useState<string | undefined>("");
  const [isImgLoading, setIsImgLoading] = useState(false);
  
  // HD Loading State: Đang tải file gốc đè lên thumbnail
  const [isHDLoading, setIsHDLoading] = useState(false); 
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const mediaItems = items.filter(i => i.file);

  // Effect: Tự động tải ảnh HD khi mở item
  useEffect(() => {
    if (!selectedItem) return;

    let isActive = true; // Cleanup flag
    let blobUrlToRevoke: string | null = null;

    const loadHighQuality = async () => {
        // 1. Nếu là video, dùng link trực tiếp (hoặc proxy nếu cần)
        if (selectedItem.file?.mimeType?.startsWith('video/')) {
             setFullViewSrc(selectedItem.downloadUrl || selectedItem.webUrl);
             setIsHDLoading(false);
             setIsImgLoading(false);
             return;
        }

        // 2. Nếu là ảnh:
        // B1: Hiển thị ngay Large Thumbnail (Preview nhanh, hơi mờ)
        // Nếu đã có blob từ lần trước, setFullViewSrc đã được clear ở handleClose, 
        // ở đây ta set placeholder.
        const placeholder = selectedItem.largeUrl || selectedItem.mediumUrl || selectedItem.thumbnailUrl;
        setFullViewSrc(placeholder);
        
        // B2: Tải Blob gốc (HD)
        if (selectedItem.downloadUrl) {
            setIsHDLoading(true); // Hiển thị spinner nhỏ báo đang nét dần
            try {
                // QUAN TRỌNG: Không gửi Token nếu là link downloadUrl (thường là 1drv.com hoặc pre-signed)
                const needsToken = selectedItem.downloadUrl.includes('graph.microsoft.com');
                
                // FIX TS ERROR: Khai báo rõ kiểu Record<string, string>
                const headers: Record<string, string> = {};
                
                if (needsToken) {
                     const token = await getAccessToken();
                     headers['Authorization'] = `Bearer ${token}`;
                }

                // Thử fetch lần 1 (theo logic trên)
                let res = await fetch(selectedItem.downloadUrl, { headers });
                
                // Nếu lỗi 401/403 (Unauthorized) và ta chưa gửi token, thử lại BẰNG API Content endpoint
                if (!res.ok && !needsToken) {
                     // Fallback: Gọi API Content chính thức
                     const token = await getAccessToken();
                     const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${selectedItem.id}/content`;
                     res = await fetch(contentUrl, {
                         headers: { 'Authorization': `Bearer ${token}` }
                     });
                }

                if (res.ok && isActive) {
                    const blob = await res.blob();
                    const hdUrl = URL.createObjectURL(blob);
                    blobUrlToRevoke = hdUrl;
                    setFullViewSrc(hdUrl); // Swap sang ảnh nét
                }
            } catch (e) {
                console.error("Failed to load HD image", e);
                // Nếu lỗi tải HD, giữ nguyên placeholder
            } finally {
                if (isActive) setIsHDLoading(false);
                if (isActive) setIsImgLoading(false); // Tắt loading tổng
            }
        } else {
             setIsImgLoading(false);
        }
    };

    setIsImgLoading(true); // Spinner chính lúc mới mở
    loadHighQuality();

    return () => {
        isActive = false;
        if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
    };
  }, [selectedItem]);

  const handleOpenItem = (item: CloudItem) => {
    setSelectedItem(item);
    // Reset states UI
    setIsDownloading(false);
    setIsDeleting(false);
    setIsSharing(false);
  };

  const handleClose = () => {
    setSelectedItem(null);
    setFullViewSrc("");
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedItem) return;
    const idx = mediaItems.findIndex(i => i.id === selectedItem.id);
    if (idx < mediaItems.length - 1) {
        handleOpenItem(mediaItems[idx + 1]);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedItem) return;
    const idx = mediaItems.findIndex(i => i.id === selectedItem.id);
    if (idx > 0) {
        handleOpenItem(mediaItems[idx - 1]);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem || !onDelete) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa "${selectedItem.name}" vĩnh viễn không?`)) return;

    setIsDeleting(true);
    try {
        await onDelete(selectedItem);
        handleClose();
    } catch (e) {
        setIsDeleting(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedItem) return;
    
    // Tải file gốc
    const targetUrl = selectedItem.downloadUrl || selectedItem.webUrl;
    if (!targetUrl) { alert("Không tìm thấy đường dẫn tải file."); return; }

    try {
        setIsDownloading(true);
        
        // FIX: Logic download tương tự như View Full - Xử lý token thông minh
        const needsToken = targetUrl.includes('graph.microsoft.com');
        
        // FIX TS ERROR: Khai báo rõ kiểu Record<string, string>
        const headers: Record<string, string> = {};
        
        if (needsToken) {
             const token = await getAccessToken();
             headers['Authorization'] = `Bearer ${token}`;
        }

        let response = await fetch(targetUrl, { headers });

        // Fallback retry nếu lỗi và chưa thử token
        if (!response.ok && !needsToken) {
             const token = await getAccessToken();
             const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${selectedItem.id}/content`;
             response = await fetch(contentUrl, {
                 headers: { 'Authorization': `Bearer ${token}` }
             });
        }
        
        if (!response.ok) throw new Error("Download failed");
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = selectedItem.name;
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        // Fallback cuối cùng: Mở tab mới (nhưng cố gắng tránh)
        window.open(targetUrl, '_blank');
    } finally {
        setIsDownloading(false);
    }
  };

  const handleShareClick = async () => {
      if (!selectedItem || !onShare) return;
      setIsSharing(true);
      try { await onShare(selectedItem); } finally { setIsSharing(false); }
  };

  const handleQRClick = async () => {
      if (!selectedItem || !onQR) return;
      onQR(selectedItem);
  };

  const canDelete = isAdmin || (currentUser && selectedItem && selectedItem.name.startsWith(currentUser.username + '_'));

  if (mediaItems.length === 0) {
      return <div className="text-center py-10 text-slate-400">Không có hình ảnh/video nào.</div>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 pb-20">
        {mediaItems.map((item) => (
            <GalleryItem 
                key={item.id} 
                item={item} 
                isSelected={selectedIds?.has(item.id) || false} 
                onToggleSelect={onToggleSelect}
                onClick={handleOpenItem}
            />
        ))}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in duration-200">
           {/* Top Bar */}
           <div className="flex justify-between items-center p-4 text-white bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
              <div className="truncate pr-4 flex-1">
                  <p className="text-sm font-bold truncate">{selectedItem.name}</p>
                  <p className="text-[10px] text-white/70">{(selectedItem.size / 1024 / 1024).toFixed(2)} MB • {new Date(selectedItem.lastModifiedDateTime).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-3 shrink-0 items-center">
                  {onQR && <button onClick={handleQRClick} className="p-2 hover:bg-white/20 rounded-full"><QrCode className="w-5 h-5" /></button>}
                  {onShare && <button onClick={handleShareClick} disabled={isSharing} className="p-2 hover:bg-white/20 rounded-full">{isSharing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}</button>}
                  {onDelete && canDelete && <button onClick={handleDelete} disabled={isDeleting} className="p-2 text-red-400 hover:bg-red-500/20 rounded-full">{isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}</button>}
                  <button onClick={handleDownload} disabled={isDownloading} className="p-2 hover:bg-white/20 rounded-full">{isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}</button>
                  <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-full"><X className="w-6 h-6" /></button>
              </div>
           </div>

           {/* Main Viewer */}
           <div className="flex-1 flex items-center justify-center relative w-full h-full p-0 sm:p-4 bg-black" onClick={handleClose}>
               {selectedItem.file?.mimeType?.startsWith('image/') ? (
                   <>
                       {/* Spinner chính khi chưa có ảnh nào */}
                       {isImgLoading && !fullViewSrc && <Loader2 className="w-10 h-10 text-emerald-500 animate-spin absolute z-0" />}
                       
                       <img 
                            src={fullViewSrc} 
                            alt="Full view" 
                            className={`max-h-full max-w-full object-contain shadow-2xl transition-opacity duration-300 z-10 ${!fullViewSrc ? 'opacity-0' : 'opacity-100'}`}
                            onClick={(e) => e.stopPropagation()} 
                       />

                       {/* Indicator đang tải HD */}
                       {isHDLoading && (
                           <div className="absolute bottom-10 bg-black/50 text-white px-3 py-1 rounded-full text-xs flex items-center backdrop-blur-md z-20">
                               <Loader2 className="w-3 h-3 animate-spin mr-2" />
                               Đang tải chất lượng cao...
                           </div>
                       )}
                   </>
               ) : selectedItem.file?.mimeType?.startsWith('video/') ? (
                   <video controls autoPlay className="max-h-full max-w-full z-10" onClick={(e) => e.stopPropagation()}>
                       <source src={fullViewSrc} type={selectedItem.file?.mimeType} />
                       Trình duyệt không hỗ trợ video.
                   </video>
               ) : (
                   <div className="text-white text-center z-10">
                       <FileIcon className="w-20 h-20 mx-auto mb-4 text-slate-500" />
                       <p>Không thể xem trước file này.</p>
                   </div>
               )}

               <button onClick={handlePrev} className="absolute left-2 top-1/2 -translate-y-1/2 p-3 bg-black/40 text-white rounded-full hover:bg-white/20 backdrop-blur-md z-20"><ChevronLeft className="w-6 h-6" /></button>
               <button onClick={handleNext} className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-black/40 text-white rounded-full hover:bg-white/20 backdrop-blur-md z-20"><ChevronRight className="w-6 h-6" /></button>
           </div>
        </div>
      )}
    </>
  );
};
