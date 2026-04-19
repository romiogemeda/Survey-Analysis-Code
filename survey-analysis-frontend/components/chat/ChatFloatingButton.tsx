import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useAppStore } from '@/lib/store';

export function ChatFloatingButton() {
  const chatPanelOpen = useAppStore((state) => state.chatPanelOpen);
  const setChatPanelOpen = useAppStore((state) => state.setChatPanelOpen);
  const activeSurvey = useAppStore((state) => state.activeSurvey);

  if (chatPanelOpen) {
    return null;
  }

  const handleClick = () => {
    if (activeSurvey) {
      setChatPanelOpen(true);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!activeSurvey}
      aria-label="Open Chat Assistant"
      className={`
        fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform duration-200
        ${
          !activeSurvey
            ? 'bg-brand-600 text-white opacity-50 cursor-not-allowed'
            : 'bg-brand-600 text-white hover:bg-brand-700 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2'
        }
      `}
    >
      <MessageCircle size={24} />
    </button>
  );
}
