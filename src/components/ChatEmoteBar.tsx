import React, { useState } from 'react';
import { MessageCircle, Send, UserCog, X } from 'lucide-react';
import { CHARACTER_SKINS } from '../shared/characters';
import { useGameStore } from '../store/useGameStore';

const EMOTES = ['❤️', '✨', '🔥', '☕', '👏', '💤'];

export const ChatEmoteBar: React.FC = () => {
  const buildMode = useGameStore((s) => s.buildMode);
  const miniMode = useGameStore((s) => s.miniMode);
  const localPlayer = useGameStore((s) => s.localPlayer);
  const chatMessages = useGameStore((s) => s.chatMessages);
  const sendChat = useGameStore((s) => s.sendChat);
  const sendEmote = useGameStore((s) => s.sendEmote);
  const sitOnFloor = useGameStore((s) => s.sitOnFloor);
  const setShowProfileModal = useGameStore((s) => s.setShowProfileModal);

  const [text, setText] = useState('');
  const [showLog, setShowLog] = useState(false);

  if (buildMode || miniMode) return null;

  const skin = CHARACTER_SKINS.find((c) => c.id === localPlayer.outfit);
  const avatarSrc = skin?.avatar || '/sprites/character/portrait_happy.png';
  const isSittingFloor = localPlayer.activity === 'sit_floor';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendChat(text);
    setText('');
  };

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2 max-w-[92vw]">
      {/* Recent Chat Log Popover */}
      {showLog && (
        <div className="w-[320px] max-h-[220px] flex flex-col rounded-2xl bg-[#181026]/92 backdrop-blur-xl border border-pink-300/30 p-3 shadow-2xl">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
            <span className="text-xs font-bold text-pink-200">
              💬 Nhật Ký Trò Chuyện
            </span>
            <button
              onClick={() => setShowLog(false)}
              className="p-0.5 rounded hover:bg-white/10 text-slate-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto cozy-scroll space-y-1.5 text-xs">
            {chatMessages.length === 0 ? (
              <div className="text-center text-slate-400 py-4 text-[11px]">
                Gửi tin nhắn để hiện bong bóng chat trên đầu nhân vật ✨
              </div>
            ) : (
              chatMessages.map((m) => (
                <div key={m.id} className="leading-snug">
                  <span
                    className="font-bold mr-1.5"
                    style={{ color: m.tintColor || '#f472b6' }}
                  >
                    {m.name}:
                  </span>
                  <span className="text-slate-100">{m.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Quick Emotes, Sit Floor & Profile Row */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          onClick={sitOnFloor}
          title="Ngồi bệt thư giãn ngay tại chỗ (Phím G)"
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold border backdrop-blur-md shadow-lg transition ${
            isSittingFloor
              ? 'bg-pink-500/30 border-pink-400 text-pink-100'
              : 'bg-[#181026]/85 border-pink-300/25 text-slate-200 hover:bg-white/15'
          }`}
        >
          <span>🧘</span>
          <span>{isSittingFloor ? 'Đứng dậy (G)' : 'Ngồi bệt (G)'}</span>
        </button>

        <div className="flex items-center gap-1 rounded-full bg-[#181026]/85 backdrop-blur-md border border-pink-300/25 px-2 py-1 shadow-lg">
          {EMOTES.map((emo) => (
            <button
              key={emo}
              onClick={() => sendEmote(emo)}
              className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-sm transition hover:scale-110 active:scale-95"
              title={`Thả cảm xúc ${emo}`}
            >
              {emo}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowProfileModal(true)}
          title="Đổi nhân vật, tên & màu thẻ tên"
          className="flex items-center gap-2 rounded-full bg-[#181026]/88 backdrop-blur-md border border-pink-300/30 px-3 py-1.5 hover:bg-white/15 transition shadow-lg"
        >
          <img
            src={avatarSrc}
            alt="Avatar"
            className="w-5 h-5 rounded-full object-cover border border-pink-300"
            style={{ imageRendering: 'pixelated' }}
          />
          <span className="text-xs font-bold text-pink-100">
            {localPlayer.name}
          </span>
          <UserCog className="w-3.5 h-3.5 text-pink-300" />
        </button>
      </div>

      {/* Chat Input Pill */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1.5 rounded-full bg-[#181026]/90 backdrop-blur-xl border border-pink-300/30 pl-3 pr-1.5 py-1.5 shadow-xl w-[min(360px,88vw)]"
      >
        <button
          type="button"
          onClick={() => setShowLog(!showLog)}
          title="Mở lịch sử chat"
          className={`p-1.5 rounded-full transition ${
            showLog
              ? 'bg-pink-500/30 text-pink-200'
              : 'hover:bg-white/10 text-slate-300'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhắn gì đó cho cả phòng..."
          maxLength={140}
          className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-gradient-to-r from-pink-500 to-violet-500 hover:brightness-110 p-1.5 text-white transition"
          title="Gửi tin nhắn"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
