import React, { useEffect } from 'react';
import { IsometricRoomCanvas } from './game/IsometricRoomCanvas';
import { TopBar } from './components/TopBar';
import { BuildCatalogDock } from './components/BuildCatalogDock';
import { FocusPanel } from './components/FocusPanel';
import { AudioMixerModal } from './components/AudioMixerModal';
import { ChatEmoteBar } from './components/ChatEmoteBar';
import { RoomAndProfileModals } from './components/RoomAndProfileModals';
import { UpdateBanner } from './components/UpdateBanner';
import { LoginScreen } from './components/LoginScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { useAuthStore } from './store/useAuthStore';
import { useGameStore } from './store/useGameStore';

export const App: React.FC = () => {
  const currentScreen = useAuthStore((s) => s.currentScreen);
  const user = useAuthStore((s) => s.user);
  const setScreen = useAuthStore((s) => s.setScreen);

  const initNetwork = useGameStore((s) => s.initNetwork);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const tickPomodoro = useGameStore((s) => s.tickPomodoro);
  const toastMessage = useGameStore((s) => s.toastMessage);
  const updateLocalProfile = useGameStore((s) => s.updateLocalProfile);

  useEffect(() => {
    // If URL contains ?room=XYZ and user is authenticated, jump straight to that room
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room') || undefined;

    if (roomFromUrl && user) {
      joinRoom(roomFromUrl);
      setScreen('game');
    } else {
      initNetwork(roomFromUrl || 'GENERAL');
    }

    if (user?.name) {
      updateLocalProfile({ name: user.name });
    }

    const timer = window.setInterval(() => {
      tickPomodoro();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [initNetwork, joinRoom, setScreen, tickPomodoro, updateLocalProfile, user]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#120d1d]">
      {currentScreen === 'login' && <LoginScreen />}

      {currentScreen === 'lobby' && (
        <>
          <LobbyScreen />
          <RoomAndProfileModals />
        </>
      )}

      {currentScreen === 'game' && (
        <>
          <IsometricRoomCanvas />
          <TopBar />
          <FocusPanel />
          <BuildCatalogDock />
          <AudioMixerModal />
          <ChatEmoteBar />
          <RoomAndProfileModals />
        </>
      )}

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
