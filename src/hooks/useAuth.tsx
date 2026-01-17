import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null; data?: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const globalForAuth = globalThis as unknown as {
  __APP_AUTH_CONTEXT__?: React.Context<AuthContextType | undefined>;
};

const AuthContext =
  globalForAuth.__APP_AUTH_CONTEXT__ ??
  (globalForAuth.__APP_AUTH_CONTEXT__ = createContext<AuthContextType | undefined>(undefined));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Mesmo se o servidor retornar erro (sessão expirada), limpar estado local
      console.warn('Logout error (clearing local state anyway):', error);
    }
    // Garantir que o estado local seja limpo
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string): Promise<{ error: Error | null; data?: any }> => {
    try {
      const { data, error } = await supabase.functions.invoke('send-password-reset', {
        body: { email }
      });
      
      // supabase.functions.invoke throws error for non-2xx responses
      // but sometimes passes the response in data
      if (error) {
        // Try to parse the error context if available
        const errorContext = (error as any)?.context;
        if (errorContext) {
          try {
            const parsed = JSON.parse(errorContext);
            if (parsed?.error === 'domain_not_verified') {
              return { 
                error: new Error('domain_not_verified'), 
                data: { error: 'domain_not_verified', message: parsed.message } 
              };
            }
          } catch {}
        }
        return { error: new Error(error.message || 'Erro ao enviar email de recuperação') };
      }
      
      // Check if the response contains an error field
      if (data?.error) {
        return { 
          error: new Error(data.error), 
          data 
        };
      }
      
      return { error: null, data };
    } catch (err: any) {
      // Handle FunctionsHttpError which includes response body
      if (err?.message?.includes('domain_not_verified') || err?.message?.includes('403')) {
        return { 
          error: new Error('domain_not_verified'), 
          data: { error: 'domain_not_verified' } 
        };
      }
      return { error: new Error(err.message || 'Erro de conexão') };
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

