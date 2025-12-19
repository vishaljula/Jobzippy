/**
 * Auth Context
 * Provides authentication state and methods throughout the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthState } from '../types';
import {
  startOAuthFlow,
  logout as logoutService,
  isAuthenticated as checkAuth,
  getUserInfo,
  getStoredTokens,
} from '../oauth/google-auth';
import { connectFirebaseAuth, disconnectFirebaseAuth } from '../firebase/session';
import { runStartupFlow } from '../startup-restore';
import { logger } from '../logger';

interface AuthContextType extends AuthState {
  login: (includeGmailScope?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
    isReady: false,
    needsOnboarding: false,
  });

  // Check authentication status on mount
  const refreshAuth = useCallback(async () => {
    try {
      logger.log('AuthContext', '🔄 Starting auth refresh...');
      setState((prev) => ({ ...prev, isLoading: true, isReady: false, error: null }));

      const authenticated = await checkAuth();

      if (authenticated) {
        const user = await getUserInfo();
        if (user) {
          // Step 1: Connect Firebase (this also checks for backup sheet ID)
          try {
            logger.log('AuthContext', '🔥 Connecting Firebase...');
            await connectFirebaseAuth(user);
          } catch (error) {
            logger.error('AuthContext', 'Failed to synchronize Firebase session', error);
          }

          // Step 2: Run startup restore flow
          logger.log('AuthContext', '🔍 Checking if restore is needed...');
          const tokens = await getStoredTokens();
          const accessToken = tokens?.access_token;

          if (accessToken) {
            const destination = await runStartupFlow(accessToken);

            if (destination === 'dashboard') {
              // User has existing data, no onboarding needed
              logger.log('AuthContext', '✅ Restore complete, user ready for dashboard');
              setState({
                isAuthenticated: true,
                isLoading: false,
                user,
                error: null,
                isReady: true,
                needsOnboarding: false,
              });
            } else {
              // New user, needs onboarding
              logger.log('AuthContext', '→ New user, needs onboarding');
              setState({
                isAuthenticated: true,
                isLoading: false,
                user,
                error: null,
                isReady: true,
                needsOnboarding: true,
              });
            }
          } else {
            // No access token, can't check backup
            logger.log('AuthContext', '⚠️ No access token, defaulting to onboarding');
            setState({
              isAuthenticated: true,
              isLoading: false,
              user,
              error: null,
              isReady: true,
              needsOnboarding: true,
            });
          }
        } else {
          setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: 'Unable to load user information',
            isReady: true,
            needsOnboarding: false,
          });
        }
      } else {
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: null,
          isReady: true,
          needsOnboarding: false,
        });
      }
    } catch (error) {
      logger.error('AuthContext', 'Error during auth refresh', error);
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: error instanceof Error ? error.message : 'Authentication check failed',
        isReady: true,
        needsOnboarding: false,
      });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = async (includeGmailScope = false) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      await startOAuthFlow(includeGmailScope);

      // Refresh auth state after successful login
      await refreshAuth();
    } catch (error) {
      console.error('[Auth] Login error:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      await logoutService();
      await disconnectFirebaseAuth();

      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
        isReady: true,
        needsOnboarding: false,
      });

      // Refresh auth state to ensure UI updates
      await refreshAuth();
    } catch (error) {
      logger.error('AuthContext', 'Logout error', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      }));
      throw error;
    }
  };

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
