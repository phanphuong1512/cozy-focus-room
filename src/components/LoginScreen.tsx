import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, User, LogIn, Coffee, ShieldCheck, ExternalLink, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../store/useAuthStore';

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://cozy-focus-server-production.up.railway.app';

export const LoginScreen: React.FC = () => {
  const loginWithUser = useAuthStore((s) => s.loginWithUser);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const authError = useAuthStore((s) => s.authError);
  const setError = useAuthStore((s) => s.setError);
  const clearError = useAuthStore((s) => s.clearError);

  const [isWaitingBrowser, setIsWaitingBrowser] = useState(false);
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState('Khách Chill');
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsWaitingBrowser(false);
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const handleGoogleLogin = async () => {
    clearError();
    const state =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const startUrl = `${SERVER_URL}/auth/google/start?state=${encodeURIComponent(state)}`;
    setIsWaitingBrowser(true);

    // Open in system default browser when inside Tauri, or popup when on web
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    try {
      if (isTauri) {
        await invoke('open_external_url', { url: startUrl });
      } else {
        window.open(startUrl, 'cozy_google_oauth', 'width=500,height=640');
      }
    } catch (err) {
      console.error('[LoginScreen] Failed to open browser for Google Auth:', err);
      setError('Không thể mở trình duyệt để đăng nhập Google.');
      setIsWaitingBrowser(false);
      return;
    }

    const startedAt = Date.now();
    pollTimerRef.current = window.setInterval(async () => {
      // Timeout after 3 minutes
      if (Date.now() - startedAt > 3 * 60 * 1000) {
        stopPolling();
        setError('Hết thời gian chờ đăng nhập Google. Vui lòng thử lại.');
        return;
      }

      try {
        const res = await fetch(
          `${SERVER_URL}/api/auth/google/status?state=${encodeURIComponent(state)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'success' && data.user) {
          stopPolling();
          loginWithUser(data.user);
        } else if (data.status === 'error') {
          stopPolling();
          setError(data.error || 'Đăng nhập Google thất bại.');
        }
      } catch {
        // Ignore transient network errors while polling
      }
    }, 1200);
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginAsGuest(guestName);
  };

  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-[#100a1c] overflow-hidden select-none p-4">
      {/* Ambient Lo-Fi Background Glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-pink-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/20 blur-[130px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-900/10 blur-[160px]" />

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-[#181126]/90 border border-pink-400/30 p-7 shadow-[0_25px_70px_rgba(0,0,0,0.7)] backdrop-blur-2xl text-center">
        {/* App Logo & Icon */}
        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500 to-violet-600 p-0.5 shadow-[0_0_25px_rgba(236,72,153,0.35)] flex items-center justify-center">
          <div className="w-full h-full rounded-[14px] bg-[#1a1228] flex items-center justify-center">
            <img
              src="/sprites/character/prop_bunny_heart.png"
              alt="Cozy Logo"
              className="w-10 h-10 object-contain drop-shadow"
            />
          </div>
        </div>

        <h1 className="text-xl font-extrabold text-white tracking-wide">
          Cozy Focus Room
        </h1>
        <p className="mt-1 text-xs text-pink-200/80 font-medium">
          Không gian co-focus ấm cúng &amp; bài trí phòng cá nhân
        </p>

        {/* Feature Highlights */}
        <div className="my-5 rounded-2xl bg-white/4 border border-white/8 p-3 text-left space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
            <span>Phòng cá nhân riêng biệt, tự do bài trí &amp; lát sàn</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Coffee className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
            <span>Phòng chung #GENERAL học tập &amp; làm việc cùng nhau</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>Đồng bộ tiến độ Pomodoro và danh sách công việc</span>
          </div>
        </div>

        {authError && (
          <div className="mb-4 rounded-xl bg-rose-500/15 border border-rose-400/40 p-2.5 text-xs text-rose-200">
            <p>{authError}</p>
            <button
              onClick={clearError}
              className="mt-1 text-[11px] underline text-rose-300 hover:text-white"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Google Sign In Button */}
        <div className="flex flex-col items-center justify-center gap-3">
          {!isWaitingBrowser ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full py-2.5 px-4 rounded-full bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs shadow-lg transition flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Tiếp tục với Google</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>
          ) : (
            <div className="w-full rounded-2xl bg-pink-500/15 border border-pink-400/40 p-3 text-xs text-pink-100 space-y-2">
              <div className="flex items-center justify-center gap-2 font-semibold">
                <span className="w-2 h-2 rounded-full bg-pink-400 animate-ping" />
                <span>Đang mở trình duyệt để xác thực Google...</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Sau khi chọn tài khoản Google trên trình duyệt, ứng dụng sẽ tự động đăng nhập.
              </p>
              <button
                type="button"
                onClick={stopPolling}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-[11px] text-slate-200 transition"
              >
                <X className="w-3 h-3" />
                <span>Hủy</span>
              </button>
            </div>
          )}

          <div className="w-full flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Hoặc
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {!showGuestInput ? (
            <button
              type="button"
              onClick={() => setShowGuestInput(true)}
              className="w-full py-2.5 px-4 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-slate-200 transition flex items-center justify-center gap-2 shadow-sm"
            >
              <User className="w-3.5 h-3.5 text-slate-300" />
              <span>Chơi nhanh làm Khách (Không cần Google)</span>
            </button>
          ) : (
            <form onSubmit={handleGuestSubmit} className="w-full space-y-2">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={20}
                placeholder="Nhập tên của bạn..."
                className="w-full rounded-full bg-black/40 border border-white/20 px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-400 text-center"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-full bg-gradient-to-r from-pink-500 to-violet-600 text-white text-xs font-bold shadow hover:brightness-110 transition flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Vào Sảnh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuestInput(false)}
                  className="py-2 px-3 rounded-full bg-white/10 hover:bg-white/15 text-slate-300 text-xs"
                >
                  Hủy
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-5 text-[10px] text-slate-400">
          Cozy Focus Room v1.0 • Lo-Fi Pomodoro Desktop Companion
        </p>
      </div>
    </div>
  );
};
