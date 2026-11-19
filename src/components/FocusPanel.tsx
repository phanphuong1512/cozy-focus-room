import React, { useState } from 'react';
import {
  Check,
  Footprints,
  Link2,
  Pause,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import type { PomodoroMode } from '../shared/types';

export const FocusPanel: React.FC = () => {
  const showFocusPanel = useGameStore((s) => s.showFocusPanel);
  const miniMode = useGameStore((s) => s.miniMode);
  const buildMode = useGameStore((s) => s.buildMode);
  const pomodoro = useGameStore((s) => s.pomodoro);
  const completedPomodoros = useGameStore((s) => s.completedPomodoros);
  const todos = useGameStore((s) => s.todos);
  const pinnedTodoId = useGameStore((s) => s.pinnedTodoId);
  const localPlayer = useGameStore((s) => s.localPlayer);

  const setShowFocusPanel = useGameStore((s) => s.setShowFocusPanel);
  const startPomodoro = useGameStore((s) => s.startPomodoro);
  const pausePomodoro = useGameStore((s) => s.pausePomodoro);
  const resetPomodoro = useGameStore((s) => s.resetPomodoro);
  const switchPomodoroMode = useGameStore((s) => s.switchPomodoroMode);
  const togglePomodoroRoomSync = useGameStore((s) => s.togglePomodoroRoomSync);
  const addTodo = useGameStore((s) => s.addTodo);
  const toggleTodo = useGameStore((s) => s.toggleTodo);
  const deleteTodo = useGameStore((s) => s.deleteTodo);
  const pinTodo = useGameStore((s) => s.pinTodo);
  const standUp = useGameStore((s) => s.standUp);

  const [newTask, setNewTask] = useState('');

  if (!showFocusPanel || miniMode || buildMode) return null;

  const mins = String(Math.floor(pomodoro.remainingSec / 60)).padStart(2, '0');
  const secs = String(pomodoro.remainingSec % 60).padStart(2, '0');
  const progress =
    pomodoro.totalSec > 0
      ? ((pomodoro.totalSec - pomodoro.remainingSec) / pomodoro.totalSec) * 100
      : 0;

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    addTodo(newTask);
    setNewTask('');
  };

  const modes: { id: PomodoroMode; label: string }[] = [
    { id: 'focus', label: 'Focus 25p' },
    { id: 'short_break', label: 'Nghỉ 5p' },
    { id: 'long_break', label: 'Nghỉ 15p' },
  ];

  return (
    <aside className="fixed top-16 right-4 z-30 w-[290px] max-h-[calc(100vh-140px)] flex flex-col gap-3 rounded-3xl bg-[#181026]/86 backdrop-blur-xl border border-pink-300/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-pink-200">🔥 Co-Focus Timer</span>
          <span className="rounded-full bg-rose-500/20 border border-rose-400/30 px-2 py-0.5 text-[10px] font-bold text-rose-200">
            🍅 x{completedPomodoros}
          </span>
        </div>
        <button
          onClick={() => setShowFocusPanel(false)}
          className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-1 bg-white/5 rounded-xl p-1">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => switchPomodoroMode(m.id)}
            className={`rounded-lg py-1 text-[11px] font-semibold transition ${
              pomodoro.mode === m.id
                ? 'bg-pink-500 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Clock Display */}
      <div className="rounded-2xl bg-black/25 border border-white/10 p-3 text-center">
        <div className="text-4xl font-mono font-extrabold tracking-wider text-white">
          {mins}:{secs}
        </div>
        <div className="mt-2.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-400 to-violet-400 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          {pomodoro.isRunning ? (
            <button
              onClick={pausePomodoro}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-1.5 text-xs font-bold text-slate-950 transition"
            >
              <Pause className="w-3.5 h-3.5" /> Tạm dừng
            </button>
          ) : (
            <button
              onClick={startPomodoro}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 hover:brightness-110 px-4 py-1.5 text-xs font-bold text-white shadow transition"
            >
              <Play className="w-3.5 h-3.5" /> Bắt đầu
            </button>
          )}
          <button
            onClick={resetPomodoro}
            title="Đặt lại đồng hồ"
            className="p-1.5 rounded-xl bg-white/8 hover:bg-white/15 text-slate-200 transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={togglePomodoroRoomSync}
          className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition ${
            pomodoro.syncedWithRoom
              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
              : 'bg-white/5 text-slate-400'
          }`}
        >
          <Link2 className="w-3 h-3" />
          {pomodoro.syncedWithRoom
            ? 'Đang đồng bộ giờ học cả phòng'
            : 'Chế độ đếm giờ cá nhân'}
        </button>
      </div>

      {/* Quick Stand Up Pill if Seated */}
      {(localPlayer.seatedOnItemUid || localPlayer.activity === 'sit_floor') && (
        <button
          onClick={standUp}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/35 border border-pink-400/35 py-1.5 text-xs font-semibold text-pink-100 transition"
        >
          <Footprints className="w-3.5 h-3.5" />
          Đứng dậy (hoặc bấm WASD)
        </button>
      )}

      {/* To-Do List Section */}
      <div className="flex flex-col min-h-0 flex-1 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-pink-100">📝 Danh Sách Công Việc</span>
          <span className="text-[10px] text-slate-400">
            {todos.filter((t) => t.completed).length}/{todos.length} xong
          </span>
        </div>

        <form onSubmit={handleAddTask} className="flex gap-1.5 mb-2">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Thêm việc cần focus..."
            className="flex-1 rounded-xl bg-white/8 border border-white/12 px-2.5 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-pink-400"
          />
          <button
            type="submit"
            className="rounded-xl bg-pink-500 hover:bg-pink-400 px-2.5 text-white transition"
            title="Thêm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        <div className="flex-1 overflow-y-auto cozy-scroll space-y-1.5 pr-1 max-h-[210px]">
          {todos.length === 0 ? (
            <div className="text-center text-[11px] text-slate-400 py-4">
              Chưa có mục tiêu nào. Thêm 1 việc để ghim lên nhân vật nhé!
            </div>
          ) : (
            todos.map((todo) => {
              const isPinned = pinnedTodoId === todo.id;
              return (
                <div
                  key={todo.id}
                  className={`group flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs border transition ${
                    isPinned
                      ? 'bg-pink-500/20 border-pink-400/50'
                      : 'bg-white/5 border-white/8 hover:bg-white/8'
                  }`}
                >
                  <button
                    onClick={() => toggleTodo(todo.id)}
                    className={`w-4 h-4 flex-shrink-0 rounded-md border flex items-center justify-center transition ${
                      todo.completed
                        ? 'bg-emerald-500 border-emerald-400 text-white'
                        : 'border-white/30 hover:border-pink-300'
                    }`}
                  >
                    {todo.completed && <Check className="w-3 h-3" />}
                  </button>
                  <span
                    className={`flex-1 truncate ${
                      todo.completed ? 'line-through text-slate-400' : 'text-slate-100'
                    }`}
                    title={todo.text}
                  >
                    {todo.text}
                  </span>
                  <button
                    onClick={() => pinTodo(isPinned ? null : todo.id)}
                    title={
                      isPinned
                        ? 'Bỏ ghim khỏi đầu nhân vật'
                        : 'Ghim lên đầu nhân vật để cả phòng thấy!'
                    }
                    className={`p-1 rounded-md transition ${
                      isPinned
                        ? 'text-amber-300 bg-amber-400/20'
                        : 'text-slate-400 hover:text-amber-200 opacity-75 group-hover:opacity-100'
                    }`}
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    title="Xóa"
                    className="p-1 rounded-md text-slate-400 hover:text-rose-300 opacity-75 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};
