/**
 * AuthContext.tsx — Estado global de autenticação do Host.
 *
 * POR QUÊ CONTEXT: O token JWT e dados do user precisam ser acessíveis
 * em qualquer parte da árvore (navbar, guards de rota, API calls).
 *
 * RESPONSABILIDADES:
 * - Armazenar/recuperar token JWT do localStorage
 * - Expor user logado e status de autenticação
 * - Funções de login, register e logout
 *
 * O QUE NÃO PERTENCE AQUI:
 * - Estados de sala (RoomContext cuida disso)
 * - Lógica de UI
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import * as api from '../services/api';

const TOKEN_KEY = 'dyswis_token';
const USER_KEY = 'dyswis_user';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithToken: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(loadUser);

  const handleAuthResponse = useCallback((res: api.AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      handleAuthResponse(res);
    },
    [handleAuthResponse],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await api.register(email, password, name);
      handleAuthResponse(res);
    },
    [handleAuthResponse],
  );

  const loginWithToken = useCallback((token: string, userData: User) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  React.useEffect(() => {
    const handleAuthExpired = () => logout();
    window.addEventListener('dyswis:auth_expired', handleAuthExpired);
    return () => window.removeEventListener('dyswis:auth_expired', handleAuthExpired);
  }, [logout]);

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, login, register, loginWithToken, logout }),
    [user, login, register, loginWithToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
};
