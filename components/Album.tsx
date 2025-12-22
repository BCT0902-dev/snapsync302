
import React, { useState } from 'react';
import { CloudItem, User } from '../types';
import { Loader2, X, ChevronLeft, ChevronRight, Download, File as FileIcon, PlayCircle, Trash2 } from 'lucide-react';

interface AlbumProps {
  items: CloudItem[];
  color: string;
  isAdmin?: boolean;
  currentUser?: User | null; // Thêm user hiện tại để check quyền sở hữu
  onDelete?: (item: CloudItem) => void;
}

export const Album: React.FC<AlbumProps> = ({ items, color, isAdmin = false, currentUser, onDelete }) => {
  const [selectedItem, setSelectedItem] = useState<CloudItem | null>(null);
  const [isImgLoading, setIsImgLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Lọc chỉ hiển thị ảnh và video trong grid
  const mediaItems = items.filter(i => i.file);

  const handleOpenItem = (item: CloudItem) => {
    setSelectedItem(item);
    setIsImgLoading(true); // Reset trạng thái loading khi mở ảnh mới
    setIsDownloading(false);
    setIsDeleting(false);
  };

  const handleClose = () => {
    setSelectedItem(null);
    setIsImgLoading(false);
    setIsDownloading(false);
    setIsDeleting(false);
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
        handleClose(); // Đóng modal sau khi xóa
    } catch (e) {
        console.error("Delete failed in UI", e);
        setIsDeleting(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedItem) return;
    
    // Ưu tiên dùng downloadUrl (link tải trực tiếp), fallback về webUrl
    const targetUrl = selectedItem.downloadUrl || selectedItem.webUrl;
    
    if (!targetUrl) {
        alert("Không tìm thấy đường dẫn tải file.");
        return;
    }

    try {
        setIsDownloading(true);
        
        // Cách 1: Fetch Blob để ép trình duyệt tải về với đúng tên file
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error("Download failed");
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = selectedItem.name; // Ép tên file đúng
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error("Blob download failed, fallback to direct link", error);
        // Cách 2 (Fallback): Mở trực tiếp link downloadUrl trong tab mới
        // Link này thường là link Azure trực tiếp, trình duyệt sẽ tự tải xuống mà không vào giao diện OneDrive
        window.open(targetUrl, '_blank');
    } finally {
        setIsDownloading(false);
    }
  };

  // Xác định URL hiển thị: Ưu tiên downloadUrl (Full Quality), dự phòng thumbnailUrl
  const getDisplayUrl = (item: CloudItem) => {
      if (item.file?.mimeType?.startsWith('video/')) {
          return item.downloadUrl || item.webUrl;
      }
      // Với ảnh: dùng downloadUrl để hiển thị nét nhất. 
      // Thẻ img tự động xử lý redirect của OneDrive/SharePoint mà không bị lỗi CORS.
      return item.downloadUrl || item.thumbnailUrl || "";
  };

  // Check quyền xóa: Admin hoặc chủ sở hữu file (tên file bắt đầu bằng username)
  const canDelete = isAdmin || (currentUser && selectedItem && selectedItem.name.startsWith(currentUser.username + '_'));

  if (mediaItems.length === 0) {
      return <div className="text-center py-10 text-slate-400">Không có hình ảnh/video nào.</div>;
  }

  return (
    <>
      {/* Grid View */}
      <div className="grid grid-cols-3 gap-1">
        {mediaItems.map((item) => (
          <div 
            key={item.id} 
            className="aspect-square relative overflow-hidden bg-slate-100 cursor-pointer"
            onClick={() => handleOpenItem(item)}
          >
            {item.thumbnailUrl ? (
                <img 
                    src={item.thumbnailUrl} 
                    alt={item.name} 
                    className="w-full h-full object-cover transition-transform hover:scale-110" 
                    loading="lazy"
                />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-1">
                    <FileIcon className="w-6 h-6 mb-1" />
                    <span className="text-[8px] truncate w-full text-center">{item.name}</span>
                </div>
            )}
            
            {/* Overlay Icon cho Video */}
            {item.file?.mimeType?.startsWith('video/') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <PlayCircle className="w-8 h-8 text-white opacity-80" />
                </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in duration-200">
           {/* Header */}
           <div className="flex justify-between items-center p-4 text-white bg-black/50 backdrop-blur-sm absolute top-0 w-full z-10">
              <div className="truncate pr-4">
                  <p className="text-sm font-bold truncate">{selectedItem.name}</p>
                  <p className="text-xs text-white/60">{(selectedItem.size / 1024 / 1024).toFixed(2)} MB • {new Date(selectedItem.lastModifiedDateTime).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-4 shrink-0 items-center">
                  {onDelete && canDelete && (
                      <button 
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-full flex items-center justify-center disabled:opacity-50"
                        title="Xóa ảnh"
                      >
                         {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                      </button>
                  )}
                  <button 
                    onClick={handleDownload} 
                    disabled={isDownloading}
                    className="p-2 hover:bg-white/20 rounded-full flex items-center justify-center disabled:opacity-50" 
                    title="Tải xuống"
                  >
                    {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  </button>
                  <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-full"><X className="w-6 h-6" /></button>
              </div>
           </div>

           {/* Content */}
           <div className="flex-1 flex items-center justify-center relative w-full h-full p-2" onClick={handleClose}>
               {selectedItem.file?.mimeType?.startsWith('image/') ? (
                   <>
                       {isImgLoading && <Loader2 className="w-10 h-10 text-white animate-spin absolute" />}
                       <img 
                            src={getDisplayUrl(selectedItem)} 
                            alt="Full view" 
                            className={`max-h-full max-w-full object-contain shadow-2xl transition-opacity duration-300 ${isImgLoading ? 'opacity-0' : 'opacity-100'}`}
                            onClick={(e) => e.stopPropagation()} // Prevent close when clicking image
                            onLoad={() => setIsImgLoading(false)}
                            onError={() => setIsImgLoading(false)}
                       />
                   </>
               ) : selectedItem.file?.mimeType?.startsWith('video/') ? (
                   <video controls autoPlay className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
                       <source src={getDisplayUrl(selectedItem)} type={selectedItem.file?.mimeType} />
                       Trình duyệt không hỗ trợ video.
                   </video>
               ) : (
                   <div className="text-white text-center">
                       <FileIcon className="w-16 h-16 mx-auto mb-4 text-white/50" />
                       <p>Không thể xem trước file này.</p>
                       <button 
                            onClick={handleDownload}
                            className="mt-4 inline-flex items-center bg-white text-black px-4 py-2 rounded-lg font-bold hover:bg-slate-200"
                        >
                            {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Tải xuống
                       </button>
                   </div>
               )}

               {/* Navigation Arrows */}
               <button onClick={handlePrev} className="absolute left-2 p-3 bg-black/30 text-white rounded-full hover:bg-white/20 backdrop-blur-md"><ChevronLeft className="w-6 h-6" /></button>
               <button onClick={handleNext} className="absolute right-2 p-3 bg-black/30 text-white rounded-full hover:bg-white/20 backdrop-blur-md"><ChevronRight className="w-6 h-6" /></button>
           </div>
        </div>
      )}
    </>
  );
};
