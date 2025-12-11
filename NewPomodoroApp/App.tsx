// App.tsx

/**
 * Pomodoro Timer App
 * SEP_Ponodoro
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabNavigator } from './src/navigation';
import { TimeRecordsProvider } from './src/context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import { FilterCameraScreen } from './src/screens/FilterCameraScreen';
import { CoinsProvider } from './src/context/CoinsContext';
import { SchoolDetailScreen } from './src/screens/SchoolDetailScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { UnreadProvider } from './src/context/UnreadContext';
import { connectChatServer, disconnectChatServer } from './src/utils/chatClient';

import type { RootStackParamList } from './src/types/navigation';

// ✅ 加上泛型
const Stack = createNativeStackNavigator<RootStackParamList>();

/** 🔹 未登入時的 Stack（只放登入畫面） */
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthScreen} />
    </Stack.Navigator>
  );
}

/** 🔹 已登入時的 Stack：Tab + 其他頁面 */
function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* 底部四個 Tab：日誌 / 砍樹 / 公會 / 商店 */}
      <Stack.Screen name="Tabs" component={TabNavigator} />

      {/* 從 Shop 進來的濾鏡相機頁面 */}
      <Stack.Screen name="FilterCamera" component={FilterCameraScreen} />
      {/* 從 Guild 進來的校內成員清單頁面 */}
      <Stack.Screen name="SchoolDetail" component={SchoolDetailScreen} />
      {/* 單一聊天頁面 */}
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}

function AppNavigation() {
  const { session } = useAuth(); // 用 session 判斷是否登入
  const userId = session?.user?.id;

  // ⭐ 有登入時嘗試連線聊天 server，失敗也沒關係
  useEffect(() => {
    if (!userId) {
      // 沒登入 or 登出 → 斷線
      disconnectChatServer();
      return;
    }

    let cancelled = false;

    (async () => {
      const ok = await connectChatServer(userId);
      if (!ok) {
        console.log('[Chat] 無法連線聊天伺服器，但 app 照常使用');
      } else if (!cancelled) {
        console.log('[Chat] 聊天伺服器連線成功');
      }
    })();

    return () => {
      cancelled = true;
      disconnectChatServer();
    };
  }, [userId]);

  return (
    <NavigationContainer>
      {userId ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

function App() {
  return (
    <AuthProvider>
      <TimeRecordsProvider>
        <CoinsProvider>
          <UnreadProvider>
            <AppNavigation />
          </UnreadProvider>
        </CoinsProvider>
      </TimeRecordsProvider>
    </AuthProvider>
  );
}

export default App;