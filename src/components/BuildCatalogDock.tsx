import React from 'react';
import {
  FlipHorizontal2,
  Maximize,
  Minimize,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { CATALOG_ITEMS, getCatalogItem } from '../shared/catalog';
import { formatFootprintLabel } from '../shared/footprint';
import { BuildTab, useGameStore } from '../store/useGameStore';
import type { TileType, WallTheme } from '../shared/types';

const TABS: { id: BuildTab; label: string }[] = [
  { id: 'floor', label: '🪵 Sàn & Tường' },
  { id: 'workspace', label: '💻 Góc Học Tập' },
  { id: 'living_room', label: '🛋️ Phòng Khách' },
  { id: 'decor', label: '🎁 Đồ Để Bàn' },
  { id: 'kitchen', label: '🍳 Nhà Bếp' },
  { id: 'bathroom', label: '🛁 Phòng Tắm' },
];

const FLOOR_BRUSHES: { id: TileType; label: string; swatch: string; desc: string }[] = [
  { id: 'W', label: 'Sàn Gỗ Sồi', swatch: 'bg-amber-600', desc: 'Ấm áp chuẩn Lo-Fi' },
  { id: 'C', label: 'Thảm Chill Pastel', swatch: 'bg-pink-300', desc: 'Sàn thảm khu ngồi' },
  { id: 'B', label: 'Gạch Men Trắng', swatch: 'bg-slate-200', desc: 'Khu bếp / phòng tắm' },
  { id: '.', label: 'Xóa Ô Sàn', swatch: 'bg-slate-800 border border-dashed border-rose-400', desc: 'Tạo góc khuyết' },
];

const WALL_THEMES: { id: WallTheme; label: string; color: string }[] = [
  { id: 'lofi_purple', label: 'Tím Lo-Fi', color: 'bg-[#4b3873]' },
  { id: 'cream', label: 'Kem Ấm', color: 'bg-[#d6c7b2]' },
  { id: 'sage', label: 'Xanh Sage', color: 'bg-[#6b8c7c]' },
  { id: 'brick', label: 'Gạch Cổ Điển', color: 'bg-[#8f4f49]' },
];

export const BuildCatalogDock: React.FC = () => {
  const buildMode = useGameStore((s) => s.buildMode);
  const buildTab = useGameStore((s) => s.buildTab);
  const activeFloorBrush = useGameStore((s) => s.activeFloorBrush);
  const selectedCatalogId = useGameStore((s) => s.selectedCatalogId);
  const movingItemUid = useGameStore((s) => s.movingItemUid);
  const placeFlipped = useGameStore((s) => s.placeFlipped);
  const layout = useGameStore((s) => s.layout);
  const isHost = useGameStore((s) => s.isHost);

  const toggleBuildMode = useGameStore((s) => s.toggleBuildMode);
  const setBuildTab = useGameStore((s) => s.setBuildTab);
  const setActiveFloorBrush = useGameStore((s) => s.setActiveFloorBrush);
  const selectCatalogItem = useGameStore((s) => s.selectCatalogItem);
  const startMovingItem = useGameStore((s) => s.startMovingItem);
  const togglePlaceFlipped = useGameStore((s) => s.togglePlaceFlipped);
  const removeItem = useGameStore((s) => s.removeItem);
  const expandFloorGrid = useGameStore((s) => s.expandFloorGrid);
  const shrinkFloorGrid = useGameStore((s) => s.shrinkFloorGrid);
  const setWallTheme = useGameStore((s) => s.setWallTheme);
  const setAllowGuestBuild = useGameStore((s) => s.setAllowGuestBuild);
  const resetDefaultRoom = useGameStore((s) => s.resetDefaultRoom);

  if (!buildMode) return null;

  const movingItem = movingItemUid
    ? layout.items.find((i) => i.uid === movingItemUid)
    : undefined;
  const movingCatalog = movingItem ? getCatalogItem(movingItem.catalogId) : undefined;

  const categoryItems =
    buildTab === 'floor'
      ? []
      : CATALOG_ITEMS.filter((i) => i.category === buildTab);

  return (
    <section className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[min(920px,95vw)] rounded-3xl bg-[#160f24]/92 backdrop-blur-xl border border-pink-300/35 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.65)]">
      {/* Top Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setBuildTab(tab.id)}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                buildTab === tab.id
                  ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white shadow-md'
                  : 'bg-white/6 hover:bg-white/12 text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {movingItem && (
            <div className="flex items-center gap-1.5 bg-sky-500/20 border border-sky-400/40 rounded-xl px-2.5 py-1 text-xs text-sky-100">
              <span>Đang di chuyển: <strong>{movingCatalog?.name}</strong></span>
              <button
                onClick={() => removeItem(movingItem.uid)}
                title="Xóa món đồ này (Phím Delete)"
                className="flex items-center gap-1 rounded-lg bg-rose-500/80 hover:bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white transition"
              >
                <Trash2 className="w-3 h-3" />
                Xóa
              </button>
              <button
                onClick={() => startMovingItem(null)}
                title="Hủy (Esc)"
                className="p-0.5 rounded hover:bg-white/15"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={togglePlaceFlipped}
            title="Lật hướng đồ vật (Phím R)"
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
              placeFlipped
                ? 'bg-amber-400/25 text-amber-200 border border-amber-300/40'
                : 'bg-white/8 hover:bg-white/15 text-slate-200'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" />
            <span>Xoay (R)</span>
          </button>

          {isHost && (
            <button
              onClick={() => setAllowGuestBuild(!layout.allowGuestBuild)}
              title="Cho phép người trong phòng cùng trang trí nhà"
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                layout.allowGuestBuild
                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                  : 'bg-white/8 hover:bg-white/15 text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{layout.allowGuestBuild ? 'Khách: Được sửa' : 'Khách: Chỉ xem'}</span>
            </button>
          )}

          <button
            onClick={() => toggleBuildMode(false)}
            className="rounded-xl bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs font-semibold text-pink-200 transition"
          >
            Xong
          </button>
        </div>
      </div>

      {/* Content Area */}
      {buildTab === 'floor' ? (
        <div className="pt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {FLOOR_BRUSHES.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveFloorBrush(b.id)}
                className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition border ${
                  activeFloorBrush === b.id
                    ? 'bg-pink-500/25 border-pink-400 text-white shadow-md'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-md ${b.swatch}`} />
                <div>
                  <div className="text-xs font-bold">{b.label}</div>
                  <div className="text-[10px] text-slate-400">{b.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
              {WALL_THEMES.map((wt) => (
                <button
                  key={wt.id}
                  onClick={() => setWallTheme(wt.id)}
                  title={`Màu tường: ${wt.label}`}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition ${
                    layout.wallTheme === wt.id
                      ? 'bg-white/20 text-white font-semibold'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${wt.color} border border-white/40`} />
                  {wt.label}
                </button>
              ))}
            </div>

            <button
              onClick={expandFloorGrid}
              className="flex items-center gap-1 rounded-xl bg-white/8 hover:bg-white/15 px-2.5 py-2 text-xs font-semibold text-slate-200 transition"
            >
              <Maximize className="w-3.5 h-3.5" /> + Rộng
            </button>
            <button
              onClick={shrinkFloorGrid}
              className="flex items-center gap-1 rounded-xl bg-white/8 hover:bg-white/15 px-2.5 py-2 text-xs font-semibold text-slate-200 transition"
            >
              <Minimize className="w-3.5 h-3.5" /> - Gọn
            </button>

            {isHost && (
              <button
                onClick={resetDefaultRoom}
                title="Đặt lại căn hộ mẫu ban đầu"
                className="flex items-center gap-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/30 px-2.5 py-2 text-xs font-semibold text-rose-200 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Phòng Mẫu
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-2.5 flex items-stretch gap-2.5 overflow-x-auto cozy-scroll pb-1">
          {categoryItems.map((item) => {
            const isSelected = selectedCatalogId === item.id;
            const placementBadge =
              item.placement === 'surface'
                ? { text: 'Đặt lên bàn ✨', cls: 'bg-sky-500/25 text-sky-200' }
                : item.placement === 'wall'
                ? { text: 'Treo tường', cls: 'bg-violet-500/25 text-violet-200' }
                : item.seatSlots?.length
                ? { text: 'Ngồi Focus 🪑', cls: 'bg-emerald-500/25 text-emerald-200' }
                : item.isSurface
                ? { text: 'Mặt bàn chứa đồ', cls: 'bg-amber-500/25 text-amber-200' }
                : { text: 'Đặt sàn', cls: 'bg-white/10 text-slate-300' };

            return (
              <button
                key={item.id}
                onClick={() => selectCatalogItem(isSelected ? null : item.id)}
                title={item.description}
                className={`relative flex-shrink-0 w-[132px] flex flex-col items-center justify-between rounded-2xl p-2 border transition text-center ${
                  isSelected
                    ? 'bg-pink-500/25 border-pink-400 shadow-[0_0_16px_rgba(244,114,182,0.35)] -translate-y-0.5'
                    : 'bg-white/5 hover:bg-white/10 border-white/10'
                }`}
              >
                <span className="absolute top-1.5 right-1.5 rounded-md bg-black/55 border border-white/15 px-1.5 py-0.5 text-[9px] font-mono font-bold text-slate-200">
                  {formatFootprintLabel(item)}
                </span>
                <div className="w-full h-14 flex items-center justify-center overflow-hidden">
                  <img
                    src={item.sprite}
                    alt={item.name}
                    className="max-h-14 max-w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
                <div className="mt-1.5 w-full">
                  <div className="text-[11px] font-bold text-slate-100 truncate">
                    {item.name}
                  </div>
                  <span
                    className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${placementBadge.cls}`}
                  >
                    {placementBadge.text}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between px-1">
        <span>
          💡 Mẹo kiểu <strong>gogh &amp; Play Together</strong>: Chọn đồ mục <strong>🎁 Đồ Để Bàn</strong> rồi rê chuột lên <em>Bàn Làm Việc / Bàn Trà / Quầy Bếp</em> để đặt lên mặt bàn!
        </span>
        <span>Click đồ có sẵn trong phòng để di chuyển hoặc xóa</span>
      </div>
    </section>
  );
};
