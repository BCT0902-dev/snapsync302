
import React, { useState } from 'react';
import { CloudItem } from '../types';
import { Loader2, X, ChevronLeft, ChevronRight, Download, File as FileIcon, PlayCircle } from 'lucide-react';

interface AlbumProps {
  items: CloudItem[];
  color: string;
}

export const Album: React.FC<AlbumProps> = ({ items, color }) => {
  const [selectedItem, setSelectedItem] = useState<CloudItem | null>(null);
  const [isImgLoading, setIsImgLoading] = useState(false);

  // Lọc chỉ hiển thị ảnh và video trong grid
  const mediaItems = items.filter(i => i.file);

  const handleOpenItem = (item: CloudItem) => {
    setSelectedItem(item);
    setIsImgLoading(true); // Reset trạng thái loading khi mở ảnh mới
  };

  const handleClose = () => {
    setSelectedItem(null);
    setIsImgLoading(false);
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

  // Xác định URL hiển thị: Ưu tiên downloadUrl (Full Quality), dự phòng thumbnailUrl
  const getDisplayUrl = (item: CloudItem) => {
      if (item.file?.mimeType?.startsWith('video/')) {
          return item.downloadUrl || item.webUrl;
      }
      // Với ảnh: dùng downloadUrl để hiển thị nét nhất. 
      // Thẻ img tự động xử lý redirect của OneDrive/SharePoint mà không bị lỗi CORS.
      return item.downloadUrl || item.thumbnailUrl || "";
  };

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
              <div className="flex gap-4 shrink-0">
                  <a href={selectedItem.webUrl} target="_blank" rel="noreferrer" className="p-2 hover:bg-white/20 rounded-full" title="Mở trong OneDrive"><Download className="w-5 h-5" /></a>
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
                       <a href={selectedItem.webUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block bg-white text-black px-4 py-2 rounded-lg font-bold">Mở trong OneDrive</a>
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
