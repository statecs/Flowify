import { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  apiKey: string | null;
  login: (key: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    localStorage.getItem('flowify_api_key')
  );

  const login = (key: string) => {
    localStorage.setItem('flowify_api_key', key);
    setApiKey(key);
  };

  const logout = () => {
    localStorage.removeItem('flowify_api_key');
    setApiKey(null);
  };

  return (
    <AuthContext.Provider value={{ apiKey, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
