import { AppConfig, VisitorRecord, QRCodeLog } from '../types';

const getAccessToken = async (): Promise<string> => {
  try {
    const response = await fetch('/api/token');
    if (!response.ok) return '';
    const data = await response.json();
    return data.accessToken || '';
  } catch (error) {
    return '';
  }
};

export const fetchQRCodeLogs = async (config: AppConfig): Promise<QRCodeLog[]> => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/qrcodes.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return [];
    return await response.json();
  } catch (error) { return []; }
};

export const deleteQRCodeLog = async (config: AppConfig, logId: string): Promise<boolean> => {
  if (config.simulateMode) return true;
  try {
    const logs = await fetchQRCodeLogs(config);
    const newLogs = logs.filter(l => l.id !== logId);
    
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/System/qrcodes.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newLogs, null, 2),
    });
    return response.ok;
  } catch (error) { return false; }
};

export const fetchVisitors = async (config: AppConfig, unit: string, monthStr: string): Promise<VisitorRecord[]> => {
  if (config.simulateMode) return [];
  try {
    const token = await getAccessToken();
    const dbPath = `${config.targetFolder}/Visits/${unit}_${monthStr}.json`;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
    
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return [];
    return await response.json();
  } catch (error) { return []; }
};

export const saveVisitor = async (config: AppConfig, unit: string, record: VisitorRecord): Promise<boolean> => {
    if (config.simulateMode) return true;
    try {
        const visitDate = new Date(record.visitDate);
        const monthStr = `${visitDate.getFullYear()}_${(visitDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const current = await fetchVisitors(config, unit, monthStr);
        const updated = [...current, record];
        
        const token = await getAccessToken();
        const dbPath = `${config.targetFolder}/Visits/${unit}_${monthStr}.json`;
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(updated, null, 2)
        });
        return response.ok;
    } catch (error) { return false; }
};

export const updateVisitorStatus = async (config: AppConfig, unit: string, visitor: VisitorRecord, status: 'pending' | 'approved' | 'completed'): Promise<boolean> => {
    if (config.simulateMode) return true;
    try {
        const visitDate = new Date(visitor.visitDate);
        const monthStr = `${visitDate.getFullYear()}_${(visitDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const current = await fetchVisitors(config, unit, monthStr);
        const updated = current.map(v => v.id === visitor.id ? { ...v, status } : v);
        
        const token = await getAccessToken();
        const dbPath = `${config.targetFolder}/Visits/${unit}_${monthStr}.json`;
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${dbPath}:/content`;
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(updated, null, 2)
        });
        return response.ok;
    } catch (error) { return false; }
};