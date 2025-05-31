"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User) => void; 
  logout: () => void;
  isLoading: boolean; 
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
        // No need to setIsLoading here as it's for initial load and session restoration
        // If the event is SIGNED_IN, we might have a new user object
        if (event === 'SIGNED_IN' && session?.user) {
            // setUser(session.user); // Already handled by the line above
        } else if (event === 'SIGNED_OUT') {
            setUser(null);
        }
      }
    );

    return () => {
      // Correct way to unsubscribe
      authListener.subscription?.unsubscribe();
    };
  }, [supabase.auth]); // supabase.auth is stable, so this effect runs once on mount

  // This login function is more for manually setting user in context if needed,
  // but Supabase auth state change should handle most cases.
  const login = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const logout = async () => {
    setIsLoading(true); // Optional: indicate loading during logout
    try {
      await supabase.auth.signOut();
      setUser(null); // Explicitly set user to null
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