import React, { useEffect, useState } from 'react';
import { Crown, DoorOpen, RotateCw, Sparkles, Users, X } from 'lucide-react';
import {
  CHARACTER_SKINS,
  resolveIsoCharacterFrame,
} from '../shared/characters';
import { useGameStore } from '../store/useGameStore';
import type { ActivityType, FacingDirection, OutfitId } from '../shared/types';

const COLORS = [
  '#f472b6',
  '#a78bfa',
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
];

type PreviewTabId = 'idle' | 'walking' | 'focus_desk' | 'chill_sofa' | 'sit_floor';

const PREVIEW_TABS: { id: PreviewTabId; label: string }[] = [
  { id: 'idle', label: 'Đứng' },
  { id: 'walking', label: 'Đi bộ' },
  { id: 'focus_desk', label: 'Gõ phím' },
  { id: 'chill_sofa', label: 'Chill' },
  { id: 'sit_floor', label: 'Ngồi bệt' },
];

const PREVIEW_FACINGS: { id: FacingDirection; label: string }[] = [
  { id: 'se', label: 'Trước Phải (SE)' },
  { id: 'sw', label: 'Trước Trái (SW)' },
  { id: 'nw', label: 'Sau Trái (NW)' },
  { id: 'ne', label: 'Sau Phải (NE)' },
];

export const RoomAndProfileModals: React.FC = () => {
  const showRoomModal = useGameStore((s) => s.showRoomModal);
  const showProfileModal = useGameStore((s) => s.showProfileModal);
  const hasCustomizedCharacter = useGameStore((s) => s.hasCustomizedCharacter);
  const roomCode = useGameStore((s) => s.roomCode);
  const isHost = useGameStore((s) => s.isHost);
  const players = useGameStore((s) => s.players);
  const localPlayer = useGameStore((s) => s.localPlayer);
  const layout = useGameStore((s) => s.layout);

  const setShowRoomModal = useGameStore((s) => s.setShowRoomModal);
  const setShowProfileModal = useGameStore((s) => s.setShowProfileModal);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const updateLocalProfile = useGameStore((s) => s.updateLocalProfile);
  const setAllowGuestBuild = useGameStore((s) => s.setAllowGuestBuild);

  const [targetRoom, setTargetRoom] = useState(roomCode);
  const [draftName, setDraftName] = useState(localPlayer.name);
  const [draftOutfit, setDraftOutfit] = useState<OutfitId>(localPlayer.outfit);
  const [draftColor, setDraftColor] = useState(localPlayer.tintColor);
  const [draftRoom, setDraftRoom] = useState(roomCode);

  const [previewTab, setPreviewTab] = useState<PreviewTabId>('idle');
  const [facingIdx, setFacingIdx] = useState(0);
  const [walkFrame, setWalkFrame] = useState(0);

  // Sync draft values whenever profile modal opens
  useEffect(() => {
    if (showProfileModal) {
      setDraftName(localPlayer.name);
      setDraftOutfit(localPlayer.outfit);
      setDraftColor(localPlayer.tintColor);
      setDraftRoom(roomCode);
    }
  }, [showProfileModal, localPlayer.name, localPlayer.outfit, localPlayer.tintColor, roomCode]);

  useEffect(() => {
    if (showRoomModal) {
      setTargetRoom(roomCode);
    }
  }, [showRoomModal, roomCode]);

  // Animate walking preview frames inside modal
  useEffect(() => {
    if (!showProfileModal || previewTab !== 'walking') return;
    const timer = window.setInterval(() => {
      setWalkFrame((f) => (f + 1) % 4);
    }, 150);
    return () => window.clearInterval(timer);
  }, [showProfileModal, previewTab]);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRoom.trim()) return;
    joinRoom(targetRoom);
    setShowRoomModal(false);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateLocalProfile({
      name: draftName.trim() || 'Kaito',
      outfit: draftOutfit,
      tintColor: draftColor,
    });
    const cleanRoom = draftRoom.trim().toUpperCase().slice(0, 16);
    if (cleanRoom && cleanRoom !== roomCode) {
      joinRoom(cleanRoom);
    }
    setShowProfileModal(false);
  };

  const activeFacing = PREVIEW_FACINGS[facingIdx];
  const resolvedPreview = resolveIsoCharacterFrame(
    draftOutfit,
    activeFacing.id,
    (previewTab === 'walking' ? 'idle' : previewTab) as ActivityType,
    previewTab === 'walking',
    walkFrame
  );

  const selectedSkin = CHARACTER_SKINS.find((c) => c.id === draftOutfit);

  return (
    <>
      {/* Multiplayer Room Switch / Invite Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#1a1228] border border-pink-300/35 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-pink-300" />
                <h2 className="text-base font-bold text-white">
                  Phòng Multiplayer Co-Focus
                </h2>
              </div>
              <button
                onClick={() => setShowRoomModal(false)}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400">Phòng hiện tại</div>
                  <div className="text-lg font-extrabold text-pink-300 tracking-wider flex items-center gap-2">
                    #{roomCode}
                    {isHost && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-300/30 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        <Crown className="w-3 h-3" /> Chủ phòng
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Thành viên</div>
                  <div className="text-sm font-bold text-white flex items-center justify-end gap-1">
                    <Users className="w-4 h-4 text-pink-300" />
                    {Object.keys(players).length} đang online
                  </div>
                </div>
              </div>

              {isHost && (
                <label className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 p-3 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-slate-100">
                      Cho phép khách cùng sửa nhà
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Tắt để chỉ mình bạn (Chủ phòng) được decor
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={layout.allowGuestBuild}
                    onChange={(e) => setAllowGuestBuild(e.target.checked)}
                    className="w-4 h-4 accent-pink-500"
                  />
                </label>
              )}

              <form onSubmit={handleJoinSubmit} className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Tạo phòng mới hoặc nhập mã phòng để vào chung:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetRoom}
                    onChange={(e) => setTargetRoom(e.target.value.toUpperCase())}
                    placeholder="Ví dụ: FROGGIE, STUDY24..."
                    maxLength={16}
                    className="flex-1 rounded-xl bg-white/8 border border-white/15 px-3 py-2 text-sm font-bold uppercase text-white focus:outline-none focus:border-pink-400"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2 text-xs font-bold text-white shadow hover:brightness-110 transition"
                  >
                    Vào Phòng
                  </button>
                </div>
              </form>

              <div className="border-t border-white/10 pt-3">
                <div className="text-[11px] font-semibold text-slate-400 mb-2">
                  Người đang trong phòng:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(players).map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-white/8 border px-2.5 py-1 text-xs font-semibold text-white"
                      style={{ borderColor: p.tintColor || '#f472b6' }}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Character Onboarding & Customization Studio Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-[#1a1228] border border-pink-300/35 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.75)] max-h-[92vh] overflow-y-auto cozy-scroll">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-300" />
                <div>
                  <h2 className="text-base font-bold text-white">
                    {hasCustomizedCharacter
                      ? '👗 Tùy Chỉnh Nhân Vật & Trang Phục'
                      : '✨ Chào Mừng Đến Cozy Focus Room — Tạo Nhân Vật Của Bạn'}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Chọn nhân vật, xem thử các dáng đi bộ / ngồi gõ phím và đặt tên hiển thị
                  </p>
                </div>
              </div>
              {hasCustomizedCharacter && (
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handleSaveProfile} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Left Column: Live Animated Character Preview Stage */}
              <div className="md:col-span-5 flex flex-col items-center justify-between rounded-2xl bg-gradient-to-b from-[#271b40] to-[#150e24] border border-white/10 p-4">
                <div className="w-full flex flex-wrap justify-center gap-1">
                  {PREVIEW_TABS.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setPreviewTab(t.id)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                        previewTab === t.id
                          ? 'bg-pink-500 text-white shadow'
                          : 'bg-white/6 text-slate-300 hover:bg-white/12'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Isometric Pedestal Preview */}
                <div className="relative my-4 flex flex-col items-center justify-center h-44 w-full">
                  <div
                    className="mb-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold text-white bg-[#181026]/90 shadow"
                    style={{ borderColor: draftColor }}
                  >
                    {draftName.trim() || 'Kaito'}
                  </div>
                  <img
                    src={resolvedPreview.path}
                    alt={selectedSkin?.name || 'Preview'}
                    className="h-32 object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)]"
                    style={{
                      imageRendering: 'pixelated',
                      transform: resolvedPreview.flipX ? 'scaleX(-1)' : 'none',
                    }}
                  />
                  <div className="w-24 h-6 -mt-3 rounded-full bg-pink-500/20 border border-pink-300/30" />
                </div>

                <div className="w-full flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <span className="text-[11px] text-slate-300">
                    Góc: <strong className="text-pink-200">{activeFacing.label}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFacingIdx((i) => (i + 1) % PREVIEW_FACINGS.length)}
                    className="flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white transition"
                  >
                    <RotateCw className="w-3 h-3" /> Xoay góc
                  </button>
                </div>
              </div>

              {/* Right Column: Character Selector + Name + Color + Room */}
              <div className="md:col-span-7 flex flex-col justify-between gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    1. Chọn Nhân Vật Isometric ({CHARACTER_SKINS.length} nhân vật):
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1 cozy-scroll">
                    {CHARACTER_SKINS.map((skin) => {
                      const active = draftOutfit === skin.id;
                      return (
                        <button
                          type="button"
                          key={skin.id}
                          onClick={() => setDraftOutfit(skin.id)}
                          className={`flex flex-col items-center rounded-2xl p-2 border transition text-center ${
                            active
                              ? 'bg-pink-500/25 border-pink-400 shadow-[0_0_14px_rgba(244,114,182,0.35)]'
                              : 'bg-white/5 hover:bg-white/10 border-white/10'
                          }`}
                        >
                          <img
                            src={skin.avatar}
                            alt={skin.name}
                            className="w-12 h-12 rounded-xl object-cover bg-white/10"
                            style={{ imageRendering: 'pixelated' }}
                          />
                          <span className="mt-1.5 text-xs font-bold text-white">
                            {skin.name}
                          </span>
                          <span className="text-[9px] text-slate-400 leading-tight line-clamp-1">
                            {skin.subtitle}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      2. Tên hiển thị:
                    </label>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={24}
                      placeholder="Nhập tên của bạn..."
                      className="w-full rounded-xl bg-white/8 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      3. Mã phòng muốn vào:
                    </label>
                    <input
                      type="text"
                      value={draftRoom}
                      onChange={(e) => setDraftRoom(e.target.value.toUpperCase())}
                      maxLength={16}
                      placeholder="FROGGIE"
                      className="w-full rounded-xl bg-white/8 border border-white/15 px-3 py-2 text-xs font-bold uppercase text-pink-200 focus:outline-none focus:border-pink-400"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                      4. Màu viền thẻ tên:
                    </span>
                    <div className="flex items-center gap-2">
                      {COLORS.map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setDraftColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition ${
                            draftColor === c
                              ? 'border-white scale-115 shadow'
                              : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg hover:brightness-110 transition"
                  >
                    {hasCustomizedCharacter ? 'Lưu Thay Đổi 💕' : 'Vào Phòng Ngay 💕'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
