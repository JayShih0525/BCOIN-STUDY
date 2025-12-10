/**
 * CalendarHeader Component
 * 日曆頁面標題欄（包含標題和 + 按鈕）
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/theme';

interface CalendarHeaderProps {
    title: string;
    onAddPress: () => void;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
    title,
    onAddPress,
}) => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.addButton} onPress={onAddPress}>
                <Text style={styles.addIcon}>+</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.md,
        paddingBottom: SPACING.sm,
    },
    title: {
        fontSize: 34,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.black,
    },
    addButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.secondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addIcon: {
        fontSize: 24,
        fontWeight: FONT_WEIGHTS.semibold,
        color: COLORS.black,
        lineHeight: 28,
    },
});
