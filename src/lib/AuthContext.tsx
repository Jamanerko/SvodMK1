import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface AppUser {
  id: string;
  phone: string;
  password: string;
  is_admin: boolean;
  is_blocked: boolean;
  is_online: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'smk_user_id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async (id: string) => {
    const { data } = await supabase.from('app_users').select('*').eq('id', id).maybeSingle();
    if (data && !data.is_blocked) {
      setUser(data as AppUser);
    } else {
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const savedId = localStorage.getItem(SESSION_KEY);
    if (savedId) {
      loadUser(savedId).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadUser]);

  const login = useCallback(async (phone: string, password: string): Promise<{ error?: string }> => {
    const { data } = await supabase
      .from('app_users')
      .select('*')
      .eq('phone', phone.trim())
      .eq('password', password.trim())
      .maybeSingle();

    if (!data) return { error: 'Неверный номер телефона или пароль' };
    if (data.is_blocked) return { error: 'Доступ заблокирован. Обратитесь к администратору' };

    await supabase
      .from('app_users')
      .update({ is_online: true, last_login_at: new Date().toISOString() })
      .eq('id', data.id);

    const updated = { ...data, is_online: true, last_login_at: new Date().toISOString() } as AppUser;
    localStorage.setItem(SESSION_KEY, data.id);
    setUser(updated);
    return {};
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      await supabase.from('app_users').update({ is_online: false }).eq('id', user.id);
    }
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
