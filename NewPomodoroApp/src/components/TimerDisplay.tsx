/**
 * TimerDisplay Component
 * 計時器顯示組件
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, FONT_WEIGHTS } from '../constants/theme';

interface TimerDisplayProps {
    minutes: number;
    seconds: number;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({ minutes, seconds }) => {
    const formatTime = (value: number): string => String(value).padStart(2, '0');

    return (
        <Text style={styles.timerDisplay}>
            {formatTime(minutes)}:{formatTime(seconds)}
        </Text>
    );
};

const styles = StyleSheet.create({
    timerDisplay: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.white,
        marginTop: 20,
        letterSpacing: 2,
    },
});
