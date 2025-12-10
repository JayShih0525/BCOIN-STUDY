/**
 * TopBar Component
 * 頂部狀態欄組件
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../constants/theme';

interface TopBarProps {
    coins: number;
    onSettingsPress?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ coins, onSettingsPress }) => {
    return (
        <View style={styles.topBar}>
            <View style={{ flex: 1 }} />
            <View style={styles.topRight}>
                <View style={styles.coinContainer}>
                    <Text style={styles.coinText}>B {coins}</Text>
                </View>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={onSettingsPress}
                >
                
                    <Text style={styles.settingsIcon}>🔚</Text>
                    {/* <img alt="../../../assets/exit.png" /> */}
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.sm,
        paddingBottom: SPACING.sm,
        width: '100%',
    },
    topRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    coinContainer: {
        backgroundColor: COLORS.secondary,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.xs,
        borderRadius: BORDER_RADIUS.sm,
    },
    coinText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.black,
    },
    settingsButton: {
        backgroundColor: COLORS.secondary,
        width: 40,
        height: 40,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsIcon: {
        fontSize: FONT_SIZES.lg,
    },
});
