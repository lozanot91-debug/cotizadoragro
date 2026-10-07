import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface AuthContextValue {
  usuario: { id: string; nombre: string; rol: 'admin'; puede_ver_costos: boolean };
  setUsuarioNombre: (nombre: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'operador_nombre';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [nombre, setNombre] = useState<string>('Admin');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setNombre(stored);
    } catch {
      // ignore
    }
  }, []);

  function setUsuarioNombre(n: string) {
    setNombre(n);
    try {
      localStorage.setItem(STORAGE_KEY, n);
    } catch {
      // ignore
    }
  }

  return (
    <AuthContext.Provider value={{
      usuario: { id: '', nombre, rol: 'admin', puede_ver_costos: true },
      setUsuarioNombre,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
