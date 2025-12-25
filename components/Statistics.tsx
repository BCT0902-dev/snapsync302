
// BCT0902
import React, { useState, useEffect } from 'react';
import { SystemStats } from '../types';
import { Users, HardDrive, FileImage, Activity, ChevronRight } from 'lucide-react';

interface StatisticsProps {
  stats: SystemStats;
  isLoading: boolean;
  color: string;
  onViewFiles?: () => void;
}

// Component con để xử lý hiệu ứng nhảy số
const AnimatedNumber = ({ value, format = (v: number) => v.toString() }: { value: number | string, format?: (v: number) => string }) => {
    const [display, setDisplay] = useState<string>("0");
    
    useEffect(() => {
        const numericValue = typeof value === 'string' ? parseFloat(value.toString().replace(/[^0-9.]/g, '')) : value;
        if (isNaN(numericValue)) {
            setDisplay(value.toString());
            return;
        }

        const duration = 1500; // 1.5 seconds
        const steps = 20;
        const intervalTime = duration / steps;
        
        let currentStep = 0;

        const interval = setInterval(() => {
            currentStep++;
            // Random số trong khoảng 0 -> giá trị thực * 1.5 để tạo hiệu ứng nhảy
            const randomVal = Math.floor(Math.random() * (numericValue * 1.2));
            setDisplay(format(randomVal));

            if (currentStep >= steps) {
                clearInterval(interval);
                setDisplay(typeof value === 'number' ? format(value) : value.toString());
            }
        }, intervalTime);

        return () => clearInterval(interval);
    }, [value]);

    return <span>{display}</span>;
};

export const Statistics: React.FC<StatisticsProps> = ({ stats, isLoading, color, onViewFiles }) => {
  
  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  // Helper để tách số và đơn vị cho animation (VD: "1.5 GB" -> animate 1.5, append GB)
  const renderStorage = (bytes: number) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
      
      return (
          <>
            <AnimatedNumber value={val} /> {sizes[i]}
          </>
      );
  };

  const cards = [
    {
      label: "Tổng User",
      value: stats.totalUsers,
      render: (v: number) => <AnimatedNumber value={v} />,
      icon: <Users className="w-6 h-6 text-blue-600" />,
      bgColor: "bg-blue-50",
      borderColor: "border-blue-100"
    },
    {
      label: "Đang hoạt động",
      value: stats.activeUsers,
      render: (v: number) => <AnimatedNumber value={v} />,
      sub: "(Đã kích hoạt)",
      icon: <Activity className="w-6 h-6 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-100"
    },
    {
      label: "Tổng File Ảnh/Video",
      value: stats.totalFiles,
      render: (v: number) => <AnimatedNumber value={v} />,
      icon: <FileImage className="w-6 h-6 text-amber-600" />,
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100",
      onClick: onViewFiles, // Add click handler
      isClickable: true
    },
    {
      label: "Dung lượng dùng",
      value: stats.totalStorage,
      render: (v: number) => renderStorage(v),
      icon: <HardDrive className="w-6 h-6 text-purple-600" />,
      bgColor: "bg-purple-50",
      borderColor: "border-purple-100"
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
       {cards.map((card, idx) => (
         <div 
            key={idx} 
            onClick={card.onClick}
            className={`p-4 rounded-xl border ${card.borderColor} ${card.bgColor} flex flex-col items-center justify-center shadow-sm relative transition-all ${card.isClickable ? 'cursor-pointer hover:shadow-md hover:brightness-95 active:scale-95' : ''}`}
         >
            {card.isClickable && (
                <div className="absolute top-2 right-2 text-slate-400 opacity-50">
                    <ChevronRight className="w-4 h-4" />
                </div>
            )}
            <div className="mb-2 p-2 bg-white rounded-full shadow-sm">
                {card.icon}
            </div>
            {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 animate-pulse rounded"></div>
            ) : (
                <p className="text-xl font-bold text-slate-800">
                    {/* @ts-ignore */}
                    {card.render ? card.render(card.value) : card.value}
                </p>
            )}
            <p className="text-xs text-slate-500 font-medium mt-1 text-center">
                {card.label}
                {card.sub && <span className="block text-[9px] opacity-70">{card.sub}</span>}
            </p>
         </div>
       ))}
    </div>
  );
};
