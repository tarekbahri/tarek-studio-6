import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-lg border border-[#E08A3C]/60 bg-[#1A0F08]/95 px-3 py-1.5 text-xs font-display font-medium text-[#FDE68A] shadow-lg pointer-events-none"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#E08A3C] shrink-0" />
      <span>Offline Mode — Local Studio Ready</span>
    </div>
  );
};
