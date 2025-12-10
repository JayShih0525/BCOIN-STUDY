// src/navigation/RootNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabNavigator } from './TabNavigator';
import { FilterCameraScreen } from '../screens/FilterCameraScreen';
import type { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
      >
        {/* ⬇ 這一個畫面就是「底部四個頁面」 */}
        <Stack.Screen name="Tabs" component={TabNavigator} />

        {/* ⬇ FilterCamera 不會出現在底部 tab，只能被 navigate 推進來 */}
        <Stack.Screen name="FilterCamera" component={FilterCameraScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};