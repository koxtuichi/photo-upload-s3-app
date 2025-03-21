import { useState, useEffect } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  updatePassword,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // ユーザーの認証状態を監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setAuthState({
          user,
          loading: false,
          error: null,
        });
      },
      (error) => {
        setAuthState({
          user: null,
          loading: false,
          error: error.message,
        });
      }
    );

    // コンポーネントのアンマウント時にリスナーを解除
    return () => unsubscribe();
  }, []);

  // ユーザー登録
  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ) => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      // ユーザー名を設定
      await updateProfile(userCredential.user, { displayName });
      setAuthState({
        user: userCredential.user,
        loading: false,
        error: null,
      });
      return userCredential.user;
    } catch (error: any) {
      setAuthState({
        user: null,
        loading: false,
        error: error.message,
      });
      throw error;
    }
  };

  // ログイン
  const signIn = async (email: string, password: string) => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      setAuthState({
        user: userCredential.user,
        loading: false,
        error: null,
      });
      return userCredential.user;
    } catch (error: any) {
      setAuthState({
        user: null,
        loading: false,
        error: error.message,
      });
      throw error;
    }
  };

  // ログアウト
  const logout = async () => {
    try {
      await signOut(auth);
      setAuthState({
        user: null,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      setAuthState((prev) => ({
        ...prev,
        error: error.message,
      }));
      throw error;
    }
  };

  // プロフィール更新
  const updateUserProfile = async (displayName: string) => {
    if (!authState.user) throw new Error("ユーザーがログインしていません");

    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await updateProfile(authState.user, { displayName });
      setAuthState((prev) => ({
        ...prev,
        user: auth.currentUser,
        loading: false,
      }));
    } catch (error: any) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
      throw error;
    }
  };

  // メールアドレス更新
  const updateUserEmail = async (newEmail: string, password: string) => {
    if (!authState.user) throw new Error("ユーザーがログインしていません");

    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // 再認証が必要
      const credential = EmailAuthProvider.credential(
        authState.user.email || "",
        password
      );
      await reauthenticateWithCredential(authState.user, credential);

      // メールアドレス更新
      await updateEmail(authState.user, newEmail);

      setAuthState((prev) => ({
        ...prev,
        user: auth.currentUser,
        loading: false,
      }));
    } catch (error: any) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
      throw error;
    }
  };

  // パスワード更新
  const updateUserPassword = async (
    currentPassword: string,
    newPassword: string
  ) => {
    if (!authState.user) throw new Error("ユーザーがログインしていません");

    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // 再認証が必要
      const credential = EmailAuthProvider.credential(
        authState.user.email || "",
        currentPassword
      );
      await reauthenticateWithCredential(authState.user, credential);

      // パスワード更新
      await updatePassword(authState.user, newPassword);

      setAuthState((prev) => ({
        ...prev,
        loading: false,
      }));
    } catch (error: any) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
      throw error;
    }
  };

  // パスワードリセットメール送信
  const sendPasswordReset = async (email: string) => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthState((prev) => ({
        ...prev,
        loading: false,
      }));
    } catch (error: any) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
      throw error;
    }
  };

  return {
    user: authState.user,
    loading: authState.loading,
    error: authState.error,
    signUp,
    signIn,
    logout,
    updateUserProfile,
    updateUserEmail,
    updateUserPassword,
    sendPasswordReset,
  };
}
