
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

// --- SUB COMPONENT: GALLERY ITEM (Xử lý tải ảnh an toàn từng ô) ---
const GalleryItem = ({ item, isSelected, onToggleSelect, onClick }: { 
    item: CloudItem, 
    isSelected: boolean, 
    onToggleSelect?: (id: string) => void,
    onClick: (item: CloudItem) => void
}) => {
    const [src, setSrc] = useState<string | undefined>(item.thumbnailUrl);
    const [isRetrying, setIsRetrying] = useState(false);
    const [hasError, setHasError] = useState(false);

    const handleLoadError = async () => {
        if (isRetrying || !item.downloadUrl) {
            setHasError(true);
            return;
        }
        
        setIsRetrying(true);
        try {
            const token = await getAccessToken();
            const res = await fetch(item.downloadUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
  const [isSecureLoading, setIsSecureLoading] = useState(false); // Đang tải lại bằng token
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const mediaItems = items.filter(i => i.file);

  const handleOpenItem = (item: CloudItem) => {
    setSelectedItem(item);
    // Reset states
    const initialUrl = item.file?.mimeType?.startsWith('video/') ? (item.downloadUrl || item.webUrl) : (item.downloadUrl || item.thumbnailUrl);
    setFullViewSrc(initialUrl);
    setIsImgLoading(true); 
    setIsSecureLoading(false);
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

  // Xử lý lỗi tải ảnh Full -> Thử tải lại bằng Token
  const handleFullImageError = async () => {
      if (isSecureLoading || !selectedItem?.downloadUrl) {
          setIsImgLoading(false);
          return;
      }

      setIsSecureLoading(true);
      try {
          const token = await getAccessToken();
          const res = await fetch(selectedItem.downloadUrl, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
              const blob = await res.blob();
              const blobUrl = URL.createObjectURL(blob);
              setFullViewSrc(blobUrl);
          }
      } catch (e) {
          console.error("Secure load failed", e);
      } finally {
          setIsSecureLoading(false);
          setIsImgLoading(false);
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
    
    const targetUrl = selectedItem.downloadUrl || selectedItem.webUrl;
    if (!targetUrl) { alert("Không tìm thấy đường dẫn tải file."); return; }

    try {
        setIsDownloading(true);
        // Dùng token fetch blob để download an toàn
        const token = await getAccessToken();
        const response = await fetch(targetUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
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
        // Fallback: Mở tab mới
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
                       {(isImgLoading || isSecureLoading) && <Loader2 className="w-10 h-10 text-emerald-500 animate-spin absolute z-0" />}
                       <img 
                            src={fullViewSrc} 
                            alt="Full view" 
                            className={`max-h-full max-w-full object-contain shadow-2xl transition-opacity duration-300 z-10 ${isImgLoading ? 'opacity-0' : 'opacity-100'}`}
                            onClick={(e) => e.stopPropagation()} 
                            onLoad={() => setIsImgLoading(false)}
                            onError={handleFullImageError}
                       />
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
