import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { Alert } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase'; // 引入剛剛建立的設定檔

// 定義 Context 的型別
type AuthContextType = {
  session: Session | null; // 用 session 來判斷是否登入
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. 初始化：檢查手機裡是否已經有儲存的登入資訊
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // 2. 監聽狀態改變 (登入、登出、Token過期都會觸發)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 登入功能
  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert('登入失敗', error.message);
    }
    // 成功時 onAuthStateChange 會自動更新 session，不需要手動 setSession
    setIsLoading(false);
  };

  // 註冊功能
  const signUp = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'NewPomodoroApp://', // Replace with your actual URL
      },
    });

    if (error) {
      Alert.alert('註冊失敗', error.message);
    } else {
      Alert.alert('註冊成功', '請至您的電子信箱收信驗證帳號！');
    }
    setIsLoading(false);
  };

  // 登出功能
  const signOut = async () => {
    setIsLoading(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('登出錯誤', error.message);
    } else {
      // ⭐ 完全清除本地 session / user
      setSession(null);
      setUser(null);

      // Alert.alert("已登出", "期待你下次再回來專注！");
    }

    setIsLoading(false);
  };

  const authContextValue = {
    session,
    user,
    isLoading,
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// 方便使用的 Hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};