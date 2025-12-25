// BCT0902
import React, { useState, useEffect } from 'react';
import { User, AppConfig, VisitorRecord } from '../types';
import { Button } from './Button';
import { UserCheck, Shield, Send, ArrowLeft, Info } from 'lucide-react';
import { saveVisitor } from '../services/graphService';

interface VisitorFormProps {
  unitCode: string;
  monthStr: string;
  config: AppConfig;
  onSuccess: () => void;
  onCancel: () => void;
}

const RELATIONSHIPS = [
  "Bố/Mẹ", "Ông/Bà", "Vợ/Chồng", "Anh/Chị/Em", "Người yêu", "Bạn bè", "Họ hàng", "Khác"
];

const UNIT_MAP: Record<string, string> = {
  'c18_e88': 'Đại đội Thông tin 18',
  'c1_d4_e88': 'Đại đội 1 / Tiểu đoàn 4',
  'd4_e88': 'Tiểu đoàn 4',
  'e88': 'Trung đoàn 88',
  // Add simple mapping or heuristic here
};

export const VisitorForm: React.FC<VisitorFormProps> = ({ unitCode, monthStr, config, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<Partial<VisitorRecord>>({
    soldierUnit: UNIT_MAP[unitCode] || unitCode, // Auto-fill unit
    relationship: 'Bố/Mẹ',
    status: 'pending'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useCustomUnit, setUseCustomUnit] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.soldierName || !formData.visitorName || !formData.phone) {
        alert("Vui lòng điền đầy đủ các trường bắt buộc (*)");
        return;
    }

    setIsSubmitting(true);
    const newRecord: VisitorRecord = {
        id: Date.now().toString(),
        soldierName: formData.soldierName || '',
        soldierUnit: formData.soldierUnit || '',
        visitorName: formData.visitorName || '',
        relationship: formData.relationship || '',
        phone: formData.phone || '',
        visitDate: new Date().toISOString(),
        status: 'pending'
    };

    const success = await saveVisitor(config, unitCode, newRecord);
    setIsSubmitting(false);

    if (success) {
        alert("Đăng ký thành công! Cán bộ đơn vị sẽ liên hệ lại với bạn.");
        onSuccess();
    } else {
        alert("Có lỗi xảy ra, vui lòng thử lại.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-emerald-600 p-6 text-white text-center relative">
                 <button 
                    onClick={onCancel}
                    className="absolute top-4 left-4 p-2 bg-white/20 rounded-full hover:bg-white/30"
                 >
                     <ArrowLeft className="w-5 h-5" />
                 </button>
                 <Shield className="w-12 h-12 mx-auto mb-2 opacity-90" />
                 <h2 className="text-xl font-bold uppercase tracking-wide">Đăng ký Thăm thân</h2>
                 <p className="text-emerald-100 text-xs mt-1">Sư đoàn 302</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg flex items-start text-xs text-blue-800 mb-4">
                    <Info className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>Vui lòng điền chính xác thông tin để đơn vị sắp xếp đón tiếp.</span>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tên quân nhân (*)</label>
                    <input 
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Nhập tên quân nhân bạn muốn thăm"
                        value={formData.soldierName || ''}
                        onChange={e => setFormData({...formData, soldierName: e.target.value})}
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Đơn vị quân nhân</label>
                    {useCustomUnit ? (
                        <input 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="Nhập tên đơn vị"
                            value={formData.soldierUnit || ''}
                            onChange={e => setFormData({...formData, soldierUnit: e.target.value})}
                        />
                    ) : (
                        <div className="flex gap-2">
                            <input 
                                disabled
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-600"
                                value={formData.soldierUnit || ''}
                            />
                            <button 
                                type="button" 
                                onClick={() => setUseCustomUnit(true)}
                                className="text-xs text-blue-600 font-bold whitespace-nowrap hover:underline px-2"
                            >
                                Sửa
                            </button>
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 my-4 pt-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Họ tên người thăm (*)</label>
                    <input 
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Họ và tên của bạn"
                        value={formData.visitorName || ''}
                        onChange={e => setFormData({...formData, visitorName: e.target.value})}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quan hệ (*)</label>
                        <select 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                            value={formData.relationship}
                            onChange={e => setFormData({...formData, relationship: e.target.value})}
                        >
                            {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SĐT Liên hệ (*)</label>
                        <input 
                            required
                            type="tel"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="Số điện thoại"
                            value={formData.phone || ''}
                            onChange={e => setFormData({...formData, phone: e.target.value})}
                        />
                    </div>
                </div>

                <Button 
                    type="submit" 
                    isLoading={isSubmitting} 
                    className="w-full mt-4 py-4 rounded-xl shadow-lg shadow-emerald-200 font-bold text-lg"
                >
                    <Send className="w-5 h-5 mr-2" />
                    Gửi Đăng ký
                </Button>
            </form>
        </div>
    </div>
  );
};