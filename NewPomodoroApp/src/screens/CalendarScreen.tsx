/**
 * CalendarScreen
 * 日曆頁面 - 顯示時間記錄和月曆
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ScreenContainer } from '../components';
import {
    CalendarHeader,
    CalendarPicker,
    TimeRecordList,
    TimeRecordSheet,
} from '../components/Calendar';
import { useTimeRecordsContext } from '../context';
import { TimeRecord, TimeRecordFormData } from '../types/timeRecord';
import { RootTabParamList } from '../types/navigation';
import { COLORS } from '../constants/theme';

type CalendarScreenNavigationProp = BottomTabNavigationProp<RootTabParamList, 'Calendar'>;

export const CalendarScreen: React.FC = () => {
    const navigation = useNavigation<CalendarScreenNavigationProp>();
    const {
        selectedDate,
        setSelectedDate,
        addRecord,
        updateRecord,
        deleteRecord,
        getRecordsForDate,
    } = useTimeRecordsContext();

    const [sheetVisible, setSheetVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null);

    // 取得選中日期的記錄
    const recordsForSelectedDate = getRecordsForDate(selectedDate);

    const handleAddPress = () => {
        setEditingRecord(null);
        setSheetVisible(true);
    };

    // const handlePressRecord = (record: TimeRecord) => {
    //     // 導航到番茄鐘頁面，帶入此任務
    //     navigation.navigate('Forest', { activeTask: record });
    // };
    const handlePressRecord = (record: TimeRecord) => {
        navigation.navigate('Forest', {
            activeTask: {
                ...record,
                // ✅ Date -> string（讓 params 可序列化）
                startTime: record.startTime.toISOString(),
                endTime: record.endTime ? record.endTime.toISOString() : undefined,
            },
        } as any);
    };

    const handleEditRecord = (record: TimeRecord) => {
        setEditingRecord(record);
        setSheetVisible(true);
    };

    const handleDeleteRecord = (id: string) => {
        deleteRecord(id);
    };

    const handleSaveRecord = (data: TimeRecordFormData): boolean => {
        if (editingRecord) {
            const success = updateRecord(editingRecord.id, data);
            if (success) {
                setEditingRecord(null);
            }
            return success;
        } else {
            const success = addRecord(data);
            if (success) {
                setEditingRecord(null);
            }
            return success;
        }
    };

    const handleCloseSheet = () => {
        setSheetVisible(false);
        setEditingRecord(null);
    };


    return (
        <ScreenContainer>
            <View style={styles.container}>
                {/* 標題和新增按鈕 */}
                <CalendarHeader title="日誌" onAddPress={handleAddPress} />

                {/* 月曆選擇器 */}
                <CalendarPicker
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                />

                {/* 時間記錄列表 */}
                <TimeRecordList
                    records={recordsForSelectedDate}
                    onPressRecord={handlePressRecord}
                    onEditRecord={handleEditRecord}
                    onDeleteRecord={handleDeleteRecord}
                />

                {/* 新增/編輯 Sheet */}
                <TimeRecordSheet
                    visible={sheetVisible}
                    onClose={handleCloseSheet}
                    onSave={handleSaveRecord}
                    editingRecord={editingRecord}
                    selectedDate={selectedDate}
                />
            </View>
        </ScreenContainer>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.primary,
    },
});
