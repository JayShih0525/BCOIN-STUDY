/**
 * TabNavigator
 * 底部標籤導航
 */

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CalendarScreen, ForestScreen, GuildScreen, ShopScreen } from '../screens';
import { RootTabParamList } from '../types/navigation';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_CONFIG = [
  {
    name: 'Calendar' as const,
    component: CalendarScreen,
    label: '日誌',
    icon: '📅',
  },
  {
    name: 'Forest' as const,
    component: ForestScreen,
    label: '砍樹',
    icon: '🌳',
  },
  {
    name: 'Guild' as const,
    component: GuildScreen,
    label: '學校',
    icon: '👥',
  },
  {
    name: 'Shop' as const,
    component: ShopScreen,
    label: '商店',
    icon: '🛒',
  }
];

export const TabNavigator: React.FC = () => {
  return (
    <View style={styles.container}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: COLORS.black,
          tabBarInactiveTintColor: COLORS.gray,
          tabBarLabelStyle: styles.tabBarLabel,
        }}>
        {TAB_CONFIG.map(({ name, component, label, icon }) => (
          <Tab.Screen
            key={name}
            name={name}
            component={component}
            options={{
              tabBarLabel: label,
              tabBarIcon: () => <Text style={styles.tabIcon}>{icon}</Text>,
            }}
          />
        ))}
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: 'rgba(212, 238, 240, 0.95)',
    borderTopWidth: 0,
    elevation: 0,
    height: 70,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.sm,
    position: 'absolute',
    bottom: 30,
    marginHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabIcon: {
    fontSize: 24,
  },
});