/**
 * TimeRecordItem Component
 * 時間記錄列表項目
 * 顯示：名稱、已執行時間、時段範圍
 * 點擊整個項目可進入番茄鐘頁面
 */

import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native';
import { TimeRecord, formatExecutedTime } from '../../types/timeRecord';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/theme';

interface TimeRecordItemProps {
    record: TimeRecord;
    onPress: (record: TimeRecord) => void;
    onEdit: (record: TimeRecord) => void;
    onDelete: (id: string) => void;
}

// 格式化時間顯示
const formatTime = (date: Date): string => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
};

export const TimeRecordItem: React.FC<TimeRecordItemProps> = ({
    record,
    onPress,
    onEdit,
    onDelete,
}) => {
    const handleMenuPress = () => {
        Alert.alert(
            record.name,
            '選擇操作',
            [
                {
                    text: '編輯',
                    onPress: () => onEdit(record),
                },
                {
                    text: '刪除',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            '確認刪除',
                            `確定要刪除「${record.name}」嗎？`,
                            [
                                { text: '取消', style: 'cancel' },
                                {
                                    text: '刪除',
                                    style: 'destructive',
                                    onPress: () => onDelete(record.id),
                                },
                            ]
                        );
                    },
                },
                {
                    text: '取消',
                    style: 'cancel',
                },
            ]
        );
    };

    const timeRange = `${formatTime(record.startTime)} - ${formatTime(record.endTime)}`;
    const executedTimeDisplay = formatExecutedTime(record.executedSeconds);

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={() => onPress(record)}
            activeOpacity={0.7}
        >
            <View style={styles.content}>
                <Text style={styles.name}>{record.name}</Text>
                <Text style={styles.duration}>{executedTimeDisplay}</Text>
                <Text style={styles.timeRange}>{timeRange}</Text>
            </View>
            <TouchableOpacity
                style={styles.menuButton}
                onPress={handleMenuPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <Text style={styles.menuIcon}>⋮</Text>
            </TouchableOpacity>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.secondary,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.md,
        borderRadius: 12,
        marginBottom: SPACING.sm,
    },
    content: {
        flex: 1,
    },
    name: {
        fontSize: FONT_SIZES.md,
        fontWeight: FONT_WEIGHTS.semibold,
        color: COLORS.black,
        marginBottom: 4,
    },
    duration: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.gray,
        marginBottom: 2,
    },
    timeRange: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.gray,
    },
    menuButton: {
        padding: SPACING.xs,
    },
    menuIcon: {
        fontSize: 20,
        color: COLORS.gray,
        fontWeight: 'bold',
    },
});
