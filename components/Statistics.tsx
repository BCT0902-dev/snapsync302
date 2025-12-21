import React from 'react';
import { SystemStats } from '../types';
import { Users, HardDrive, FileImage, Activity } from 'lucide-react';

interface StatisticsProps {
  stats: SystemStats;
  isLoading: boolean;
  color: string;
}

export const Statistics: React.FC<StatisticsProps> = ({ stats, isLoading, color }) => {
  
  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const cards = [
    {
      label: "Tổng User",
      value: stats.totalUsers,
      icon: <Users className="w-6 h-6 text-blue-600" />,
      bgColor: "bg-blue-50",
      borderColor: "border-blue-100"
    },
    {
      label: "Đang hoạt động",
      value: stats.activeUsers,
      sub: "(Đã kích hoạt)",
      icon: <Activity className="w-6 h-6 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-100"
    },
    {
      label: "Tổng File Ảnh/Video",
      value: stats.totalFiles,
      icon: <FileImage className="w-6 h-6 text-amber-600" />,
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100"
    },
    {
      label: "Dung lượng dùng",
      value: formatBytes(stats.totalStorage),
      icon: <HardDrive className="w-6 h-6 text-purple-600" />,
      bgColor: "bg-purple-50",
      borderColor: "border-purple-100"
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
       {cards.map((card, idx) => (
         <div key={idx} className={`p-4 rounded-xl border ${card.borderColor} ${card.bgColor} flex flex-col items-center justify-center shadow-sm`}>
            <div className="mb-2 p-2 bg-white rounded-full shadow-sm">
                {card.icon}
            </div>
            {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 animate-pulse rounded"></div>
            ) : (
                <p className="text-xl font-bold text-slate-800">{card.value}</p>
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
