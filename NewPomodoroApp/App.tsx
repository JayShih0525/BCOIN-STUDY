/**
 * Pomodoro Timer App
 * SEP_Ponodoro
 *
 * @format
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabNavigator } from './src/navigation';
import { TimeRecordsProvider } from './src/context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import { FilterCameraScreen } from './src/screens/FilterCameraScreen'; // ⬅️ 新增

const Stack = createNativeStackNavigator();

/** 🔹 未登入時的 Stack（只放登入畫面） */
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthScreen} />
    </Stack.Navigator>
  );
}

/** 🔹 已登入時的 Stack：Tab + FilterCamera */
function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* 這個畫面裡面就是底部四個 Tab：日誌 / 砍樹 / 公會 / 商店 */}
      <Stack.Screen name="Tabs" component={TabNavigator} />

      {/* 從 Shop 進來的濾鏡相機頁面，不會出現在 TabBar 上 */}
      <Stack.Screen name="FilterCamera" component={FilterCameraScreen} />
    </Stack.Navigator>
  );
}

function AppNavigation() {
  const { session } = useAuth(); // 用 session 判斷是否登入

  return (
    <NavigationContainer>
      {/* 有登入 -> 進 MainStack；沒登入 -> 進 AuthStack */}
      {session && session.user ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

function App() {
  return (
    <AuthProvider>
      <TimeRecordsProvider>
        <AppNavigation />
      </TimeRecordsProvider>
    </AuthProvider>
  );
}

export default App;