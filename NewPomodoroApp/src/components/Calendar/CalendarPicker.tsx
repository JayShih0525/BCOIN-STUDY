/**
 * CalendarPicker Component
 * 使用原生 DateTimePicker 顯示月曆
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../constants/theme';

interface CalendarPickerProps {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const CalendarPicker: React.FC<CalendarPickerProps> = ({
    selectedDate,
    onDateChange,
}) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));

    const getDaysInMonth = (date: Date): (number | null)[] => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days: (number | null)[] = [];

        // 填充月初空白
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }

        // 填充日期
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    };

    const handlePrevMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const handleDayPress = (day: number) => {
        const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        onDateChange(newDate);
    };

    const isSelectedDay = (day: number): boolean => {
        return (
            selectedDate.getDate() === day &&
            selectedDate.getMonth() === currentMonth.getMonth() &&
            selectedDate.getFullYear() === currentMonth.getFullYear()
        );
    };

    const isToday = (day: number): boolean => {
        const today = new Date();
        return (
            today.getDate() === day &&
            today.getMonth() === currentMonth.getMonth() &&
            today.getFullYear() === currentMonth.getFullYear()
        );
    };

    const days = getDaysInMonth(currentMonth);

    return (
        <View style={styles.container}>
            {/* 月份標題 */}
            <View style={styles.monthHeader}>
                <TouchableOpacity onPress={handlePrevMonth}>
                    <Text style={styles.navArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.monthTitle}>
                    {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </Text>
                <TouchableOpacity onPress={handleNextMonth}>
                    <Text style={styles.navArrow}>›</Text>
                </TouchableOpacity>
            </View>

            {/* 星期標題 */}
            <View style={styles.weekdaysRow}>
                {WEEKDAYS.map(day => (
                    <Text key={day} style={styles.weekdayText}>{day}</Text>
                ))}
            </View>

            {/* 日期網格 */}
            <View style={styles.daysGrid}>
                {days.map((day, index) => (
                    <View key={index} style={styles.dayCell}>
                        {day !== null && (
                            <TouchableOpacity
                                style={[
                                    styles.dayButton,
                                    isSelectedDay(day) && styles.selectedDay,
                                    isToday(day) && !isSelectedDay(day) && styles.todayDay,
                                ]}
                                onPress={() => handleDayPress(day)}
                            >
                                <Text
                                    style={[
                                        styles.dayText,
                                        isSelectedDay(day) && styles.selectedDayText,
                                        isToday(day) && !isSelectedDay(day) && styles.todayDayText,
                                    ]}
                                >
                                    {day}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.secondary,
        borderRadius: BORDER_RADIUS.sm,
        marginHorizontal: SPACING.lg,
        padding: SPACING.md,
    },
    monthHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    monthTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
        color: COLORS.black,
    },
    navArrow: {
        fontSize: 24,
        color: '#007AFF',
        paddingHorizontal: SPACING.sm,
    },
    weekdaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: SPACING.xs,
    },
    weekdayText: {
        flex: 1,
        textAlign: 'center',
        fontSize: 11,
        fontWeight: '600',
        color: COLORS.gray,
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayText: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.black,
    },
    selectedDay: {
        backgroundColor: '#007AFF',
    },
    selectedDayText: {
        color: COLORS.white,
        fontWeight: '600',
    },
    todayDay: {
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    todayDayText: {
        color: '#007AFF',
        fontWeight: '600',
    },
});
