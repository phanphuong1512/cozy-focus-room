import React, { useEffect, useState } from 'react';
import {
  DoorOpen,
  Home,
  LogOut,
  Palette,
  Sparkles,
  Users,
  ArrowRight,
  Shield,
  Hash,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useGameStore } from '../store/useGameStore';

export const LobbyScreen: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setScreen = useAuthStore((s) => s.setScreen);

  const joinRoom = useGameStore((s) => s.joinRoom);
  const setShowProfileModal = useGameStore((s) => s.setShowProfileModal);
  const updateLocalProfile = useGameStore((s) => s.updateLocalProfile);
  const localPlayer = useGameStore((s) => s.localPlayer);

  const [customRoom, setCustomRoom] = useState('');
  const [generalPlayersCount, setGeneralPlayersCount] = useState<number | null>(null);

  // Sync user display name to game profile if not set
  useEffect(() => {
    if (user?.name && localPlayer.name === 'Người chơi') {
      updateLocalProfile({ name: user.name });
    }
  }, [user, localPlayer.name, updateLocalProfile]);

  // Query live count for GENERAL room
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const serverUrl =
          (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ||
          'https://cozy-focus-server-production.up.railway.app';
        const res = await fetch(`${serverUrl}/api/room-details`);
        if (res.ok) {
          const data = await res.json();
          if (data.GENERAL) {
            setGeneralPlayersCount(data.GENERAL.playerCount);
          }
        }
      } catch {
        // Ignore network errors in preview
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleJoinGeneral = () => {
    setScreen('game');
    joinRoom('GENERAL');
  };

  const handleJoinPersonal = () => {
    if (!user) return;
    const cleanUid = user.uid.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'MYROOM';
    const personalCode = `ROOM_${cleanUid}`;
    setScreen('game');
    joinRoom(personalCode, { isPersonal: true });
  };

  const handleJoinCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customRoom.trim().toUpperCase().slice(0, 24);
    if (!clean) return;
    setScreen('game');
    joinRoom(clean);
  };

  return (
    <div className="relative w-screen h-screen flex flex-col items-center justify-between bg-[#110a1c] overflow-y-auto select-none p-5 cozy-scroll">
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed -top-32 left-1/4 w-[500px] h-[500px] rounded-full bg-pink-500/10 blur-[140px]" />
      <div className="pointer-events-none fixed -bottom-32 right-1/4 w-[500px] h-[500px] rounded-full bg-violet-600/15 blur-[140px]" />

      {/* Top Bar / User Header */}
      <header className="relative z-10 w-full max-w-4xl flex items-center justify-between rounded-2xl bg-[#1a1228]/80 border border-white/10 px-5 py-3 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-10 h-10 rounded-full border-2 border-pink-400/50 object-cover shadow"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow">
                {user?.name?.charAt(0) || 'U'}
              </div>
            )}
            {!user?.isGuest && (
              <span
                title="Tài khoản Google đã xác thực"
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#1a1228] flex items-center justify-center text-[9px] text-white"
              >
                ✓
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">{user?.name}</h2>
              {user?.isGuest ? (
                <span className="rounded-full bg-white/10 border border-white/15 px-2 py-0.2 text-[10px] text-slate-300">
                  Khách
                </span>
              ) : (
                <span className="rounded-full bg-pink-500/20 border border-pink-400/30 px-2 py-0.2 text-[10px] font-semibold text-pink-200 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  Google
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {user?.email || 'Đang chơi ở chế độ khách'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition shadow-sm"
          >
            <Palette className="w-3.5 h-3.5 text-pink-300" />
            <span>Đổi trang phục</span>
          </button>
          <button
            onClick={logout}
            title="Đăng xuất"
            className="flex items-center gap-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 px-3 py-1.5 text-xs font-semibold text-rose-200 transition shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>

      {/* Main Selection Area */}
      <main className="relative z-10 w-full max-w-4xl my-auto py-8">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/15 border border-pink-400/30 px-3.5 py-1 text-xs font-semibold text-pink-200 mb-3 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            Sảnh Chờ Cozy Focus Room
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide">
            Chọn không gian học tập &amp; thư giãn
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Bạn có thể tham gia vào phòng chung cùng mọi người hoặc mở không gian riêng của mình
          </p>
        </div>

        {/* Two Main Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {/* 1. Public Room Card: #GENERAL */}
          <div
            onClick={handleJoinGeneral}
            className="group relative cursor-pointer rounded-3xl bg-gradient-to-b from-[#211633] to-[#181026] border border-pink-400/25 hover:border-pink-400/70 p-6 shadow-[0_15px_40px_rgba(0,0,0,0.5)] hover:shadow-[0_20px_50px_rgba(236,72,153,0.25)] transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{generalPlayersCount !== null ? `${generalPlayersCount} online` : 'Trực tuyến'}</span>
            </div>

            <div>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow mb-4 group-hover:scale-105 transition">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-white group-hover:text-pink-200 transition">
                  Phòng Chung Lo-Fi
                </h3>
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-mono font-bold text-pink-300">
                  #GENERAL
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Không gian co-focus công cộng học tập và làm việc cùng mọi người. Hỗ trợ Pomodoro đồng bộ toàn phòng và trò chuyện chill.
              </p>
            </div>

            <button
              type="button"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-600 text-white font-bold text-xs shadow-md group-hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              <DoorOpen className="w-4 h-4" />
              <span>Vào Phòng Chung #GENERAL</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </button>
          </div>

          {/* 2. Personal Room Card */}
          <div
            onClick={handleJoinPersonal}
            className="group relative cursor-pointer rounded-3xl bg-gradient-to-b from-[#241738] to-[#191129] border border-violet-400/30 hover:border-violet-400/80 p-6 shadow-[0_15px_40px_rgba(0,0,0,0.5)] hover:shadow-[0_20px_50px_rgba(139,92,246,0.25)] transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="absolute top-4 right-4 rounded-full bg-violet-500/20 border border-violet-400/30 px-2.5 py-1 text-[11px] font-bold text-violet-200">
              Riêng tư • 14x14
            </div>

            <div>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow mb-4 group-hover:scale-105 transition">
                <Home className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-white group-hover:text-violet-200 transition">
                  Phòng Cá Nhân Của Tôi
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Căn phòng 14x14 rộng rãi thuộc sở hữu của riêng bạn. Tự do lát các loại gạch gỗ, đổi màu tường và bài trí tối đa 30 món nội thất theo phong cách riêng.
              </p>
            </div>

            <button
              type="button"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold text-xs shadow-md group-hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-pink-200" />
              <span>Vào Phòng Cá Nhân Của Tôi</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </button>
          </div>
        </div>

        {/* Custom Room Join Bar */}
        <div className="rounded-2xl bg-[#181126]/70 border border-white/10 p-4 backdrop-blur-md">
          <form
            onSubmit={handleJoinCustom}
            className="flex flex-col sm:flex-row items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Hash className="w-4 h-4 text-pink-400 flex-shrink-0" />
              <span>Tham gia phòng bạn bè theo mã:</span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={customRoom}
                onChange={(e) => setCustomRoom(e.target.value)}
                maxLength={24}
                placeholder="Ví dụ: STUDY123..."
                className="w-full sm:w-56 rounded-xl bg-black/40 border border-white/15 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-400 font-mono uppercase"
              />
              <button
                type="submit"
                className="whitespace-nowrap px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition flex items-center gap-1.5"
              >
                <span>Tham gia</span>
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center text-[11px] text-slate-400 py-2">
        Cozy Focus Room • Phiên bản v1.0 • Không gian học tập Lo-Fi nhẹ nhàng
      </footer>
    </div>
  );
};
