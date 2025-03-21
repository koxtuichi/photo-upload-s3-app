"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";

// 認証コンテキストの型定義
interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUserProfile: (displayName: string) => Promise<void>;
  updateUserEmail: (newEmail: string, password: string) => Promise<void>;
  updateUserPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

// デフォルト値を持つ認証コンテキストを作成
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  signUp: async () => {
    throw new Error("AuthProvider not initialized");
  },
  signIn: async () => {
    throw new Error("AuthProvider not initialized");
  },
  logout: async () => {
    throw new Error("AuthProvider not initialized");
  },
  updateUserProfile: async () => {
    throw new Error("AuthProvider not initialized");
  },
  updateUserEmail: async () => {
    throw new Error("AuthProvider not initialized");
  },
  updateUserPassword: async () => {
    throw new Error("AuthProvider not initialized");
  },
  sendPasswordReset: async () => {
    throw new Error("AuthProvider not initialized");
  },
});

// AuthProviderコンポーネント
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

// カスタムフックでコンテキストを使用
export const useAuthContext = () => useContext(AuthContext);
