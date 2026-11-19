import React, { useEffect, useRef, useState } from 'react';
import { Crown, DoorOpen, RotateCw, Shuffle, Sparkles, Users, X } from 'lucide-react';
import {
  ACCESSORIES,
  CHARACTER_SKINS,
  CLOTHING_COLORS,
  DEFAULT_CUSTOM_AVATAR,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  TOP_STYLES,
  resolveIsoCharacterFrame,
} from '../shared/characters';
import { parseFrameContext, renderCustomAvatarToCanvas } from '../shared/avatarRenderer';
import { useGameStore } from '../store/useGameStore';
import type { ActivityType, CustomAvatarConfig, FacingDirection, OutfitId } from '../shared/types';

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
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const players = useGameStore((s) => s.players);
  const localPlayer = useGameStore((s) => s.localPlayer);
  const layout = useGameStore((s) => s.layout);

  const setShowRoomModal = useGameStore((s) => s.setShowRoomModal);
  const setShowProfileModal = useGameStore((s) => s.setShowProfileModal);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const resetDefaultRoom = useGameStore((s) => s.resetDefaultRoom);
  const kickPlayer = useGameStore((s) => s.kickPlayer);
  const updateLocalProfile = useGameStore((s) => s.updateLocalProfile);
  const setAllowGuestBuild = useGameStore((s) => s.setAllowGuestBuild);

  const [targetRoom, setTargetRoom] = useState(roomCode);
  const [draftName, setDraftName] = useState(localPlayer.name);
  const [draftOutfit, setDraftOutfit] = useState<OutfitId>(localPlayer.outfit);
  const [draftCustomAvatar, setDraftCustomAvatar] = useState<CustomAvatarConfig>(
    localPlayer.customAvatar || DEFAULT_CUSTOM_AVATAR
  );
  const [customTab, setCustomTab] = useState<'face' | 'hair' | 'outfit' | 'acc'>('hair');
  const [draftColor, setDraftColor] = useState(localPlayer.tintColor);
  const [draftRoom, setDraftRoom] = useState(roomCode);

  const [previewTab, setPreviewTab] = useState<PreviewTabId>('idle');
  const [facingIdx, setFacingIdx] = useState(0);
  const [walkFrame, setWalkFrame] = useState(0);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync draft values whenever profile modal opens
  useEffect(() => {
    if (showProfileModal) {
      setDraftName(localPlayer.name);
      setDraftOutfit(localPlayer.outfit);
      setDraftCustomAvatar(localPlayer.customAvatar || DEFAULT_CUSTOM_AVATAR);
      setDraftColor(localPlayer.tintColor);
      setDraftRoom(roomCode);
    }
  }, [
    showProfileModal,
    localPlayer.name,
    localPlayer.outfit,
    localPlayer.customAvatar,
    localPlayer.tintColor,
    roomCode,
  ]);

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
      name: draftName.trim() || 'Người chơi',
      outfit: draftOutfit,
      customAvatar: draftCustomAvatar,
      tintColor: draftColor,
    });
    const cleanRoom = draftRoom.trim().toUpperCase().slice(0, 16);
    if (cleanRoom && cleanRoom !== roomCode) {
      joinRoom(cleanRoom);
    }
    setShowProfileModal(false);
  };

  const handleRandomizeCustomAvatar = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    setDraftCustomAvatar({
      skinTone: pick(SKIN_TONES).color,
      hairStyle: pick(HAIR_STYLES).id,
      hairColor: pick(HAIR_COLORS),
      eyeStyle: pick(EYE_STYLES).id,
      blush: Math.random() > 0.3,
      topStyle: pick(TOP_STYLES).id,
      topColor: pick(CLOTHING_COLORS),
      bottomColor: pick(CLOTHING_COLORS),
      shoeColor: pick(CLOTHING_COLORS),
      accessory: pick(ACCESSORIES).id,
    });
  };

  const activeFacing = PREVIEW_FACINGS[facingIdx];
  const resolvedPreview = resolveIsoCharacterFrame(
    draftOutfit,
    activeFacing.id,
    (previewTab === 'walking' ? 'idle' : previewTab) as ActivityType,
    previewTab === 'walking',
    walkFrame
  );

  // Render live composite canvas preview when custom avatar is selected
  useEffect(() => {
    if (!showProfileModal || draftOutfit !== 'custom') return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !previewCanvasRef.current) return;
      renderCustomAvatarToCanvas(
        img,
        draftCustomAvatar,
        parseFrameContext(resolvedPreview.path),
        previewCanvasRef.current
      );
    };
    img.src = resolvedPreview.path;
    return () => {
      cancelled = true;
    };
  }, [showProfileModal, draftOutfit, draftCustomAvatar, resolvedPreview.path]);

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
                <>
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

                  <div className="flex items-center justify-end px-1">
                    <button
                      type="button"
                      onClick={() => {
                        resetDefaultRoom();
                        setShowRoomModal(false);
                      }}
                      className="flex items-center gap-1.5 text-xs text-pink-300/80 hover:text-pink-200 transition"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Khôi phục bài trí phòng mẫu ban đầu
                    </button>
                  </div>
                </>
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
                    placeholder="Ví dụ: GENERAL, STUDY24..."
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
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/8 border px-2.5 py-1 text-xs font-semibold text-white"
                      style={{ borderColor: p.tintColor || '#f472b6' }}
                    >
                      <span>{p.name}</span>
                      {p.id === myPlayerId && (
                        <span className="text-[10px] text-pink-300 font-normal">(Bạn)</span>
                      )}
                      {isHost && p.id !== myPlayerId && (
                        <button
                          type="button"
                          onClick={() => kickPlayer(p.id)}
                          className="ml-1 rounded-full p-0.5 text-slate-400 hover:text-red-300 hover:bg-red-500/20 transition"
                          title={`Mời ${p.name} ra khỏi phòng`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
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
                    {draftName.trim() || 'Người chơi'}
                  </div>
                  {draftOutfit === 'custom' ? (
                    <canvas
                      ref={previewCanvasRef}
                      width={180}
                      height={240}
                      className="h-32 w-auto object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)]"
                      style={{
                        imageRendering: 'pixelated',
                        transform: resolvedPreview.flipX ? 'scaleX(-1)' : 'none',
                      }}
                    />
                  ) : (
                    <img
                      src={resolvedPreview.path}
                      alt={selectedSkin?.name || 'Preview'}
                      className="h-32 object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)]"
                      style={{
                        imageRendering: 'pixelated',
                        transform: resolvedPreview.flipX ? 'scaleX(-1)' : 'none',
                      }}
                    />
                  )}
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

              {/* Right Column: Character Selector + Custom Studio + Name + Color + Room */}
              <div className="md:col-span-7 flex flex-col justify-between gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    1. Chọn Nhân Vật Isometric ({CHARACTER_SKINS.length} nhân vật):
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1 cozy-scroll">
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
                            className="w-11 h-11 rounded-xl object-cover bg-white/10"
                            style={{ imageRendering: 'pixelated' }}
                          />
                          <span className="mt-1 text-[11px] font-bold text-white leading-tight">
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

                {/* Custom Avatar Creator Studio */}
                {draftOutfit === 'custom' && (
                  <div className="rounded-2xl bg-white/5 border border-pink-400/30 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {(
                          [
                            { id: 'hair', label: 'Tóc' },
                            { id: 'face', label: 'Da & Mắt' },
                            { id: 'outfit', label: 'Áo & Quần' },
                            { id: 'acc', label: 'Phụ kiện' },
                          ] as const
                        ).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setCustomTab(t.id)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                              customTab === t.id
                                ? 'bg-pink-500 text-white shadow'
                                : 'bg-white/8 text-slate-300 hover:bg-white/15'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleRandomizeCustomAvatar}
                        className="flex items-center gap-1 rounded-lg bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/30 px-2.5 py-1 text-[11px] font-semibold text-violet-100 transition"
                      >
                        <Shuffle className="w-3 h-3" /> Ngẫu nhiên
                      </button>
                    </div>

                    {customTab === 'hair' && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {HAIR_STYLES.map((hs) => (
                            <button
                              key={hs.id}
                              type="button"
                              onClick={() =>
                                setDraftCustomAvatar((c) => ({ ...c, hairStyle: hs.id }))
                              }
                              className={`rounded-lg px-2 py-1 text-[11px] border transition ${
                                draftCustomAvatar.hairStyle === hs.id
                                  ? 'bg-pink-500/30 border-pink-400 text-white font-semibold'
                                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              {hs.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 mr-1">Màu tóc:</span>
                          {HAIR_COLORS.map((col) => (
                            <button
                              key={col}
                              type="button"
                              onClick={() =>
                                setDraftCustomAvatar((c) => ({ ...c, hairColor: col }))
                              }
                              className={`w-5 h-5 rounded-full border-2 transition ${
                                draftCustomAvatar.hairColor === col
                                  ? 'border-white scale-110'
                                  : 'border-transparent opacity-80 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: col }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {customTab === 'face' && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 mr-1">Màu da:</span>
                          {SKIN_TONES.map((st) => (
                            <button
                              key={st.color}
                              type="button"
                              title={st.label}
                              onClick={() =>
                                setDraftCustomAvatar((c) => ({ ...c, skinTone: st.color }))
                              }
                              className={`w-5 h-5 rounded-full border-2 transition ${
                                draftCustomAvatar.skinTone === st.color
                                  ? 'border-white scale-110'
                                  : 'border-transparent opacity-80 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: st.color }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {EYE_STYLES.map((es) => (
                            <button
                              key={es.id}
                              type="button"
                              onClick={() =>
                                setDraftCustomAvatar((c) => ({ ...c, eyeStyle: es.id }))
                              }
                              className={`rounded-lg px-2 py-1 text-[11px] border transition ${
                                draftCustomAvatar.eyeStyle === es.id
                                  ? 'bg-pink-500/30 border-pink-400 text-white font-semibold'
                                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              {es.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setDraftCustomAvatar((c) => ({ ...c, blush: !c.blush }))
                            }
                            className={`rounded-lg px-2 py-1 text-[11px] border transition ${
                              draftCustomAvatar.blush
                                ? 'bg-rose-500/30 border-rose-400 text-rose-100 font-semibold'
                                : 'bg-white/5 border-white/10 text-slate-400'
                            }`}
                          >
                            Má hồng
                          </button>
                        </div>
                      </div>
                    )}

                    {customTab === 'outfit' && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {TOP_STYLES.map((ts) => (
                            <button
                              key={ts.id}
                              type="button"
                              onClick={() =>
                                setDraftCustomAvatar((c) => ({ ...c, topStyle: ts.id }))
                              }
                              className={`rounded-lg px-2 py-1 text-[11px] border transition ${
                                draftCustomAvatar.topStyle === ts.id
                                  ? 'bg-pink-500/30 border-pink-400 text-white font-semibold'
                                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              {ts.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 mr-1">Áo:</span>
                          {CLOTHING_COLORS.map((col) => (
                            <button
                              key={`top_${col}`}
                              type="button"
                              onClick={() =>
                                setDraftCustomAvatar((c) => ({ ...c, topColor: col }))
                              }
                              className={`w-4 h-4 rounded-full border-2 transition ${
                                draftCustomAvatar.topColor === col
                                  ? 'border-white scale-115'
                                  : 'border-transparent opacity-80'
                              }`}
                              style={{ backgroundColor: col }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 mr-1">Quần:</span>
                          {CLOTHING_COLORS.map((col) => (
                            <button
                              key={`bot_${col}`}
                              type="button"
                              onClick={() =>
                                setDraftCustomAvatar((c) => ({ ...c, bottomColor: col }))
                              }
                              className={`w-4 h-4 rounded-full border-2 transition ${
                                draftCustomAvatar.bottomColor === col
                                  ? 'border-white scale-115'
                                  : 'border-transparent opacity-80'
                              }`}
                              style={{ backgroundColor: col }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {customTab === 'acc' && (
                      <div className="flex flex-wrap gap-1.5">
                        {ACCESSORIES.map((ac) => (
                          <button
                            key={ac.id}
                            type="button"
                            onClick={() =>
                              setDraftCustomAvatar((c) => ({ ...c, accessory: ac.id }))
                            }
                            className={`rounded-lg px-2.5 py-1 text-[11px] border transition ${
                              draftCustomAvatar.accessory === ac.id
                                ? 'bg-pink-500/30 border-pink-400 text-white font-semibold'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {ac.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                      placeholder="GENERAL"
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
