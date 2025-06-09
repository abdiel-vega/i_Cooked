"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User) => void; // login function signature
  logout: () => void;
  isLoading: boolean; // loading state for auth operations
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getSession = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch (error) {
        console.error("Error getting session:", error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
        // no need to setisloading here, it's for initial load and session restoration
        // if the event is signed_in, we might have a new user object
        if (event === 'SIGNED_IN' && session?.user) {
        } else if (event === 'SIGNED_OUT') {
            setUser(null);
        }
      }
    );

    return () => {
      // correct way to unsubscribe from auth listener
      authListener.subscription?.unsubscribe();
    };
  }, [supabase.auth]); // supabase.auth is stable, so this effect runs once on mount

  // this login function is more for manually setting user in context if needed,
  // but supabase auth state change should handle most cases.
  const login = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const logout = async () => {
    setIsLoading(true); // indicate loading during logout
    try {
      await supabase.auth.signOut();
      setUser(null); // explicitly set user to null on logout
    } catch (error) {
        console.error("Error signing out:", error);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};