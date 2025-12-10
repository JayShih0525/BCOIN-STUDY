/**
 * ScreenContainer Component
 * 螢幕容器組件
 */

import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

interface ScreenContainerProps {
    children: React.ReactNode;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({ children }) => {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.primary} />
            {children}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.primary,
        flex: 1,
    },
});
