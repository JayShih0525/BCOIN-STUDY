/**
 * TimeRecordList Component
 * 時間記錄列表
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { TimeRecord } from '../../types/timeRecord';
import { TimeRecordItem } from './TimeRecordItem';
import { COLORS, SPACING, FONT_SIZES } from '../../constants/theme';

interface TimeRecordListProps {
    records: TimeRecord[];
    onPressRecord: (record: TimeRecord) => void;
    onEditRecord: (record: TimeRecord) => void;
    onDeleteRecord: (id: string) => void;
}

export const TimeRecordList: React.FC<TimeRecordListProps> = ({
    records,
    onPressRecord,
    onEditRecord,
    onDeleteRecord,
}) => {
    if (records.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>此日期沒有時間記錄</Text>
                <Text style={styles.emptySubtext}>點擊右上角 + 新增記錄</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
        >
            {records.map(record => (
                <TimeRecordItem
                    key={record.id}
                    record={record}
                    onPress={onPressRecord}
                    onEdit={onEditRecord}
                    onDelete={onDeleteRecord}
                />
            ))}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: SPACING.lg,
    },
    contentContainer: {
        paddingTop: SPACING.md,
        paddingBottom: 120, // 為底部 TabBar 預留空間
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.lg,
    },
    emptyText: {
        fontSize: FONT_SIZES.md,
        color: COLORS.gray,
        marginBottom: SPACING.xs,
    },
    emptySubtext: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.gray,
        opacity: 0.7,
    },
});
