import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { PublicUser } from '../types';

interface AuthState {
  session: Session | null;
  user: User | null;
  publicUser: PublicUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function ensurePublicUser(user: User): Promise<PublicUser | null> {
  const name =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;

  const { data, error } = await supabase.rpc('claim_or_create_user', {
    p_auth_id: user.id,
    p_email: user.email!,
    p_name: name,
  });

  if (error) {
    console.error('claim_or_create_user failed:', error);
    return null;
  }

  console.log('claim_or_create_user response:', JSON.stringify(data));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    console.error('claim_or_create_user returned no user row');
  }
  return (row as PublicUser) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [publicUser, setPublicUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadPublicUser = async (u: User) => {
      try {
        const pu = await ensurePublicUser(u);
        if (!cancelled) setPublicUser(pu);
      } catch (e) {
        console.error('ensurePublicUser threw:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setSession(session);
      if (session?.user) {
        loadPublicUser(session.user);
      } else {
        setLoading(false);
      }
    });

    // IMPORTANT: do not await inside onAuthStateChange — it deadlocks the auth client.
    // Defer any supabase calls with setTimeout(..., 0).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(() => {
          if (!cancelled) loadPublicUser(newSession.user);
        }, 0);
      } else {
        setPublicUser(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPublicUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        publicUser,
        loading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
