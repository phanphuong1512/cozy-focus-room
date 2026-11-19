import React, { useState } from 'react';
import {
  CloudRain,
  Copy,
  Crown,
  Headphones,
  ListTodo,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  Paintbrush,
  Pin,
  PinOff,
  Sun,
  Sunrise,
  Users,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';

export const TopBar: React.FC = () => {
  const connected = useGameStore((s) => s.connected);
  const roomCode = useGameStore((s) => s.roomCode);
  const isHost = useGameStore((s) => s.isHost);
  const layout = useGameStore((s) => s.layout);
  const players = useGameStore((s) => s.players);
  const buildMode = useGameStore((s) => s.buildMode);
  const showAudioMixer = useGameStore((s) => s.showAudioMixer);
  const showFocusPanel = useGameStore((s) => s.showFocusPanel);
  const miniMode = useGameStore((s) => s.miniMode);
  const alwaysOnTop = useGameStore((s) => s.alwaysOnTop);
  const pomodoro = useGameStore((s) => s.pomodoro);

  const toggleBuildMode = useGameStore((s) => s.toggleBuildMode);
  const setLightingMode = useGameStore((s) => s.setLightingMode);
  const toggleRain = useGameStore((s) => s.toggleRain);
  const setShowAudioMixer = useGameStore((s) => s.setShowAudioMixer);
  const setShowFocusPanel = useGameStore((s) => s.setShowFocusPanel);
  const setShowRoomModal = useGameStore((s) => s.setShowRoomModal);
  const toggleAlwaysOnTop = useGameStore((s) => s.toggleAlwaysOnTop);
  const toggleMiniMode = useGameStore((s) => s.toggleMiniMode);
  const showToast = useGameStore((s) => s.showToast);

  const [copied, setCopied] = useState(false);

  const playerCount = Object.keys(players).length;
  const canDecorate = isHost || layout.allowGuestBuild;

  const mins = String(Math.floor(pomodoro.remainingSec / 60)).padStart(2, '0');
  const secs = String(pomodoro.remainingSec % 60).padStart(2, '0');

  const copyRoomCode = () => {
    navigator.clipboard?.writeText(roomCode).then(() => {
      setCopied(true);
      showToast(`📋 Đã copy mã phòng "${roomCode}"! Gửi cho người yêu / bạn bè cùng vào nhé 💕`);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  if (miniMode) {
    return (
      <header className="fixed top-2 left-2 right-2 z-40 flex items-center justify-between gap-2 rounded-2xl bg-[#181026]/90 backdrop-blur-md border border-pink-300/30 px-3 py-1.5 shadow-xl">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="text-xs font-bold text-pink-200">#{roomCode}</span>
          <span className="text-xs font-mono font-bold text-amber-200 bg-white/10 px-2 py-0.5 rounded-full">
            {mins}:{secs}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAudioMixer(!showAudioMixer)}
            title="Âm thanh Lo-Fi"
            className="p-1.5 rounded-lg hover:bg-white/10 text-pink-200 transition"
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleAlwaysOnTop}
            title="Ghim cửa sổ nổi"
            className={`p-1.5 rounded-lg transition ${
              alwaysOnTop ? 'bg-pink-500/30 text-pink-200' : 'hover:bg-white/10 text-slate-300'
            }`}
          >
            {alwaysOnTop ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={toggleMiniMode}
            title="Phóng to lại cửa sổ"
            className="p-1.5 rounded-lg bg-pink-500/25 hover:bg-pink-500/40 text-pink-100 transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-2 max-w-[96vw]">
      <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-[#181026]/88 backdrop-blur-xl border border-pink-300/30 px-3.5 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        {/* Room & Multiplayer Status */}
        <button
          onClick={() => setShowRoomModal(true)}
          className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white/5 hover:bg-white/12 px-2.5 py-1 transition"
          title="Đổi phòng / Mời bạn bè"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
            }`}
          />
          {isHost && <Crown className="w-3.5 h-3.5 text-amber-300" />}
          <span className="text-xs font-bold text-pink-100 tracking-wide">
            {roomCode}
          </span>
          {!connected && (
            <span className="text-[10px] font-semibold text-amber-300">
              Đang kết nối...
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-slate-300 border-l border-white/15 pl-2">
            <Users className="w-3 h-3 text-pink-300" />
            {playerCount}
          </span>
        </button>

        <button
          onClick={copyRoomCode}
          title="Copy mã phòng để mời bạn"
          className="p-1.5 rounded-full hover:bg-white/10 text-pink-200 transition"
        >
          <Copy className={`w-3.5 h-3.5 ${copied ? 'text-emerald-300' : ''}`} />
        </button>

        <div className="w-px h-5 bg-white/15" />

        {/* Atmosphere Controls */}
        <div className="flex items-center gap-1 bg-white/5 rounded-full p-0.5">
          <button
            onClick={() => setLightingMode('day')}
            title="Ban Ngày"
            className={`p-1.5 rounded-full transition ${
              layout.lightingMode === 'day'
                ? 'bg-amber-400/25 text-amber-200'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setLightingMode('sunset')}
            title="Hoàng Hôn Ấm"
            className={`p-1.5 rounded-full transition ${
              layout.lightingMode === 'sunset'
                ? 'bg-orange-400/25 text-orange-200'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sunrise className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setLightingMode('night')}
            title="Đêm Lo-Fi (Đèn bàn phát sáng)"
            className={`p-1.5 rounded-full transition ${
              layout.lightingMode === 'night'
                ? 'bg-indigo-400/30 text-indigo-200'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleRain}
            title="Bật/Tắt Mưa rơi"
            className={`p-1.5 rounded-full transition ${
              layout.rainEnabled
                ? 'bg-sky-400/25 text-sky-200'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-px h-5 bg-white/15" />

        {/* Decor Button */}
        <button
          onClick={() => toggleBuildMode()}
          title={
            canDecorate
              ? 'Xây & Trang trí căn hộ (Phím B)'
              : 'Chỉ Chủ phòng mới có quyền sửa phòng'
          }
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition ${
            buildMode
              ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white shadow-[0_0_15px_rgba(244,114,182,0.5)]'
              : canDecorate
              ? 'bg-white/10 hover:bg-white/18 text-pink-100'
              : 'bg-white/5 text-slate-400 cursor-not-allowed'
          }`}
        >
          {canDecorate ? (
            <Paintbrush className="w-3.5 h-3.5" />
          ) : (
            <Lock className="w-3.5 h-3.5" />
          )}
          <span>Decor (B)</span>
        </button>

        {/* Productivity & Lo-Fi Audio */}
        <button
          onClick={() => setShowFocusPanel(!showFocusPanel)}
          title="Pomodoro & To-Do List"
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition ${
            showFocusPanel
              ? 'bg-pink-500/25 text-pink-100 border border-pink-400/40'
              : 'bg-white/8 hover:bg-white/15 text-slate-300'
          }`}
        >
          <ListTodo className="w-3.5 h-3.5" />
          <span className="font-mono">{mins}:{secs}</span>
        </button>

        <button
          onClick={() => setShowAudioMixer(!showAudioMixer)}
          title="Bộ trộn nhạc Lo-Fi & Tiếng Mưa"
          className={`p-1.5 rounded-full transition ${
            showAudioMixer
              ? 'bg-pink-500/30 text-pink-100'
              : 'bg-white/8 hover:bg-white/15 text-pink-200'
          }`}
        >
          <Headphones className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-white/15" />

        {/* Desktop Companion Buttons */}
        <button
          onClick={toggleAlwaysOnTop}
          title="Ghim nổi trên màn hình (Tauri Desktop)"
          className={`p-1.5 rounded-full transition ${
            alwaysOnTop
              ? 'bg-amber-400/25 text-amber-200'
              : 'hover:bg-white/10 text-slate-300'
          }`}
        >
          {alwaysOnTop ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={toggleMiniMode}
          title="Thu gọn chế độ Mini Widget"
          className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 transition"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
