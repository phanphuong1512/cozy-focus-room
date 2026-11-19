import { create } from 'zustand';

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  avatarUrl: string;
  isGuest?: boolean;
}

export type AppScreen = 'login' | 'lobby' | 'game';

const AUTH_STORAGE_KEY = 'cozy_auth_session_v1';

export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
  '743759840913-cr689blpjcct1t6cb6e6cibjusdgavc7.apps.googleusercontent.com';

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function saveStoredUser(user: AuthUser | null) {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
  } catch {
    // Ignore quota errors
  }
}

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('[auth] Failed to parse JWT:', err);
    return null;
  }
}

interface AuthStoreState {
  user: AuthUser | null;
  currentScreen: AppScreen;
  isLoading: boolean;
  authError: string | null;

  loginWithGoogleCredential: (credential: string) => boolean;
  loginAsGuest: (guestName?: string) => void;
  logout: () => void;
  setScreen: (screen: AppScreen) => void;
  clearError: () => void;
}

const initialUser = loadStoredUser();

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: initialUser,
  currentScreen: initialUser ? 'lobby' : 'login',
  isLoading: false,
  authError: null,

  loginWithGoogleCredential: (credential: string) => {
    try {
      const payload = parseJwt(credential);
      if (!payload || !payload.sub) {
        set({ authError: 'Không thể xác thực mã từ Google. Vui lòng thử lại.' });
        return false;
      }

      const user: AuthUser = {
        uid: String(payload.sub),
        name: String(payload.name || payload.given_name || 'Người dùng Google'),
        email: String(payload.email || ''),
        avatarUrl: String(payload.picture || ''),
        isGuest: false,
      };

      saveStoredUser(user);
      set({ user, currentScreen: 'lobby', authError: null });
      return true;
    } catch (err) {
      console.error('[auth] Google login error:', err);
      set({ authError: 'Đã có lỗi khi đăng nhập bằng Google.' });
      return false;
    }
  },

  loginAsGuest: (guestName = 'Khách Chill') => {
    const guestUid = 'guest_' + Math.random().toString(36).slice(2, 10);
    const user: AuthUser = {
      uid: guestUid,
      name: guestName.trim() || 'Khách Chill',
      email: '',
      avatarUrl: '/sprites/characters/c1/avatar.png',
      isGuest: true,
    };
    saveStoredUser(user);
    set({ user, currentScreen: 'lobby', authError: null });
  },

  logout: () => {
    saveStoredUser(null);
    set({ user: null, currentScreen: 'login', authError: null });
  },

  setScreen: (screen) => set({ currentScreen: screen }),
  clearError: () => set({ authError: null }),
}));
