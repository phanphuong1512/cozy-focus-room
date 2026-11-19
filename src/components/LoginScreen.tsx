import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, User, LogIn, Coffee, ShieldCheck } from 'lucide-react';
import { GOOGLE_CLIENT_ID, useAuthStore } from '../store/useAuthStore';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              shape?: 'pill' | 'rectangular';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              width?: number;
              logo_alignment?: 'left' | 'center';
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export const LoginScreen: React.FC = () => {
  const loginWithGoogleCredential = useAuthStore((s) => s.loginWithGoogleCredential);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const authError = useAuthStore((s) => s.authError);
  const clearError = useAuthStore((s) => s.clearError);

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState('Khách Chill');

  useEffect(() => {
    let checkInterval: number | null = null;

    const setupGoogleGsi = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return false;

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) {
              loginWithGoogleCredential(response.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 280,
          logo_alignment: 'left',
        });

        setGoogleLoaded(true);
        return true;
      } catch (err) {
        console.error('[LoginScreen] GSI init error:', err);
        return false;
      }
    };

    if (!setupGoogleGsi()) {
      checkInterval = window.setInterval(() => {
        if (setupGoogleGsi()) {
          if (checkInterval) window.clearInterval(checkInterval);
        }
      }, 300);
    }

    return () => {
      if (checkInterval) window.clearInterval(checkInterval);
    };
  }, [loginWithGoogleCredential]);

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
              Thử lại
            </button>
          </div>
        )}

        {/* Google Sign In Container */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div
            ref={googleBtnRef}
            className="min-h-[44px] flex items-center justify-center"
          />

          {!googleLoaded && (
            <div className="text-[11px] text-slate-400 animate-pulse">
              Đang tải Google Sign-In...
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
