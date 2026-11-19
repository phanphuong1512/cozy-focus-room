import React from 'react';
import {
  CloudRain,
  Flame,
  Keyboard,
  Music,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import type { AudioChannel } from '../shared/types';

const CHANNELS: {
  id: AudioChannel;
  label: string;
  icon: React.FC<{ className?: string }>;
  accent: string;
}[] = [
  { id: 'bgm', label: 'Nhạc Lo-Fi Chill', icon: Music, accent: 'accent-pink-400' },
  { id: 'rain', label: 'Tiếng Mưa Rơi', icon: CloudRain, accent: 'accent-sky-400' },
  { id: 'fire', label: 'Lửa Trại Ấm', icon: Flame, accent: 'accent-orange-400' },
  {
    id: 'keyboard',
    label: 'Phím Cơ ASMR',
    icon: Keyboard,
    accent: 'accent-violet-400',
  },
  { id: 'wind', label: 'Gió Đêm Dịu', icon: Wind, accent: 'accent-emerald-400' },
];

export const AudioMixerModal: React.FC = () => {
  const showAudioMixer = useGameStore((s) => s.showAudioMixer);
  const audioMixer = useGameStore((s) => s.audioMixer);
  const setShowAudioMixer = useGameStore((s) => s.setShowAudioMixer);
  const setChannelVolume = useGameStore((s) => s.setChannelVolume);
  const toggleMasterMute = useGameStore((s) => s.toggleMasterMute);

  if (!showAudioMixer) return null;

  return (
    <div className="fixed top-16 left-4 z-50 w-[300px] rounded-3xl bg-[#181026]/94 backdrop-blur-xl border border-pink-300/30 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <span className="text-sm font-bold text-pink-200">
          🎧 Lo-Fi &amp; Ambient Mixer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMasterMute}
            title={audioMixer.muted ? 'Bật lại âm thanh' : 'Tắt tiếng toàn bộ'}
            className={`p-1.5 rounded-full transition ${
              audioMixer.muted
                ? 'bg-rose-500/25 text-rose-300'
                : 'bg-white/10 text-pink-200 hover:bg-white/20'
            }`}
          >
            {audioMixer.muted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setShowAudioMixer(false)}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {CHANNELS.map((ch) => {
          const Icon = ch.icon;
          const val = audioMixer[ch.id];
          return (
            <div key={ch.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-slate-200">
                  <Icon className="w-3.5 h-3.5 text-pink-300" />
                  {ch.label}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {Math.round(val * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={val}
                onChange={(e) =>
                  setChannelVolume(ch.id, Number(e.target.value))
                }
                className={`w-full h-1.5 rounded-lg bg-white/10 cursor-pointer ${ch.accent}`}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-slate-400 leading-relaxed">
        Trộn tiếng mưa rơi, lửa trại và tiếng phím cơ cùng nhạc Lo-Fi để tạo không gian tập trung riêng cho hai bạn ✨
      </p>
    </div>
  );
};
