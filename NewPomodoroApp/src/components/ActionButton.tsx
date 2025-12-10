/**
 * ActionButton Component
 * 動作按鈕組件
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../constants/theme';

interface ActionButtonProps {
    title: string;
    onPress: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ title, onPress }) => {
    return (
        <TouchableOpacity style={styles.button} onPress={onPress}>
            <Text style={styles.buttonText}>{title}</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        backgroundColor: COLORS.secondary,
        paddingVertical: SPACING.md,
        paddingHorizontal: 80,
        borderRadius: BORDER_RADIUS.md,
        marginBottom: SPACING.lg,
    },
    buttonText: {
        fontSize: FONT_SIZES.lg,
        fontWeight: FONT_WEIGHTS.semibold,
        color: COLORS.black,
    },
});
