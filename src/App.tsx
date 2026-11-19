import React, { useEffect } from 'react';
import { IsometricRoomCanvas } from './game/IsometricRoomCanvas';
import { TopBar } from './components/TopBar';
import { BuildCatalogDock } from './components/BuildCatalogDock';
import { FocusPanel } from './components/FocusPanel';
import { AudioMixerModal } from './components/AudioMixerModal';
import { ChatEmoteBar } from './components/ChatEmoteBar';
import { RoomAndProfileModals } from './components/RoomAndProfileModals';
import { UpdateBanner } from './components/UpdateBanner';
import { useGameStore } from './store/useGameStore';

export const App: React.FC = () => {
  const initNetwork = useGameStore((s) => s.initNetwork);
  const tickPomodoro = useGameStore((s) => s.tickPomodoro);
  const toastMessage = useGameStore((s) => s.toastMessage);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room') || undefined;
    initNetwork(roomFromUrl);

    const timer = window.setInterval(() => {
      tickPomodoro();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [initNetwork, tickPomodoro]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#120d1d]">
      <IsometricRoomCanvas />
      <TopBar />
      <FocusPanel />
      <BuildCatalogDock />
      <AudioMixerModal />
      <ChatEmoteBar />
      <RoomAndProfileModals />
      <UpdateBanner />

      {toastMessage && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-[#1a1228]/95 backdrop-blur-md border border-pink-400/50 px-5 py-2 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.55)]">
          {toastMessage}
        </div>
      )}
    </main>
  );
};

export default App;
