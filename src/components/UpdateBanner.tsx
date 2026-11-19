import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';

const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute while playing

export const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isCheckingRef = useRef(false);
  const dismissedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return;
    }

    let cancelled = false;

    const checkForUpdates = async () => {
      if (isCheckingRef.current || cancelled) return;
      isCheckingRef.current = true;
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const found = await check();
        if (!cancelled && found) {
          setUpdate(found);
          if (dismissedVersionRef.current !== found.version) {
            setDismissed(false);
          }
          setErrorMsg(null);
        }
      } catch {
        // Silent ignore when offline or endpoint not reachable yet
      } finally {
        isCheckingRef.current = false;
      }
    };

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    const initialTimer = window.setTimeout(checkForUpdates, 2500);
    const interval = window.setInterval(checkForUpdates, CHECK_INTERVAL_MS);
    window.addEventListener('focus', checkForUpdates);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForUpdates);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, []);

  if (!update || dismissed) return null;

  const handleInstallAndRestart = async () => {
    setInstalling(true);
    setErrorMsg(null);
    setProgressPct(0);

    let totalBytes = 0;
    let downloadedBytes = 0;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0;
          downloadedBytes = 0;
          setProgressPct(totalBytes > 0 ? 0 : null);
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgressPct(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
          }
        } else if (event.event === 'Finished') {
          setProgressPct(100);
        }
      });

      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      setInstalling(false);
      setErrorMsg(
        err instanceof Error
          ? `Không thể cập nhật: ${err.message}`
          : 'Không thể tải bản cập nhật, vui lòng thử lại.'
      );
    }
  };

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-20 right-4 z-50 w-80 rounded-2xl bg-[#1a1228]/95 backdrop-blur-xl border border-pink-400/45 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-slate-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 text-white shadow">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-white">
              Đã có bản cập nhật v{update.version}
            </h3>
            <p className="text-[10px] text-pink-200/80">
              Cập nhật nhanh cho Cozy Focus Room
            </p>
          </div>
        </div>
        {!installing && (
          <button
            type="button"
            onClick={() => {
              dismissedVersionRef.current = update.version;
              setDismissed(true);
            }}
            aria-label="Đóng thông báo cập nhật"
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {update.body && (
        <p className="mt-2.5 max-h-20 overflow-y-auto whitespace-pre-line rounded-xl bg-white/5 px-2.5 py-2 text-[11px] leading-relaxed text-slate-300 cozy-scroll">
          {update.body}
        </p>
      )}

      {installing && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-pink-200 mb-1">
            <span>Đang tải bản cập nhật...</span>
            <span>{progressPct !== null ? `${progressPct}%` : '...'}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-400 transition-all duration-200"
              style={{ width: `${progressPct ?? 45}%` }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <p className="mt-2 text-[11px] text-rose-300">{errorMsg}</p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        {!installing && (
          <button
            type="button"
            onClick={() => {
              dismissedVersionRef.current = update.version;
              setDismissed(true);
            }}
            className="rounded-xl bg-white/8 hover:bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition"
          >
            Để sau
          </button>
        )}
        <button
          type="button"
          disabled={installing}
          onClick={handleInstallAndRestart}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 px-3 py-1.5 text-[11px] font-bold text-white shadow hover:brightness-110 disabled:opacity-60 transition"
        >
          {installing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Đang cài đặt...
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              Cập nhật &amp; Khởi động lại
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
