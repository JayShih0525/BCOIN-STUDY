/**
 * TimeRecordSheet Component
 * 新增/編輯時間記錄的 Bottom Sheet
 * 只包含：名稱、開始時間、結束時間
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TimeRecord, TimeRecordFormData } from '../../types/timeRecord';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../../constants/theme';

interface TimeRecordSheetProps {
    visible: boolean;
    onClose: () => void;
    onSave: (data: TimeRecordFormData) => boolean;
    editingRecord?: TimeRecord | null;
    selectedDate: Date;
}

export const TimeRecordSheet: React.FC<TimeRecordSheetProps> = ({
    visible,
    onClose,
    onSave,
    editingRecord,
    selectedDate,
}) => {
    const [name, setName] = useState('');
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    // 當編輯模式時，填入現有資料
    useEffect(() => {
        if (editingRecord) {
            setName(editingRecord.name);
            setStartTime(new Date(editingRecord.startTime));
            setEndTime(new Date(editingRecord.endTime));
        } else {
            // 重置表單，使用選中的日期
            setName('');
            const now = new Date();
            const newStartTime = new Date(selectedDate);
            newStartTime.setHours(now.getHours(), now.getMinutes(), 0, 0);
            setStartTime(newStartTime);

            const newEndTime = new Date(selectedDate);
            newEndTime.setHours(now.getHours() + 1, now.getMinutes(), 0, 0);
            setEndTime(newEndTime);
        }
    }, [editingRecord, visible, selectedDate]);

    const handleSave = () => {
        if (!name.trim()) {
            Alert.alert('請輸入名稱', '任務名稱不能為空');
            return;
        }

        // 確保結束時間晚於開始時間
        const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
        const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();

        if (endMinutes <= startMinutes) {
            Alert.alert('時間錯誤', '結束時間必須晚於開始時間');
            return;
        }

        // 將時間設定為選中日期
        const finalStartTime = new Date(selectedDate);
        finalStartTime.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

        const finalEndTime = new Date(selectedDate);
        finalEndTime.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

        const success = onSave({
            name: name.trim(),
            startTime: finalStartTime,
            endTime: finalEndTime,
        });

        if (success) {
            onClose();
        }
    };

    const formatTimeDisplay = (date: Date): string => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={styles.cancelButton}>取消</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {editingRecord ? '編輯任務' : '新增任務'}
                    </Text>
                    <TouchableOpacity onPress={handleSave}>
                        <Text style={[styles.saveButton, !name.trim() && styles.disabledButton]}>
                            儲存
                        </Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
                    {/* 名稱輸入 */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>名稱</Text>
                        <TextInput
                            style={styles.textInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="輸入任務名稱"
                            placeholderTextColor={COLORS.gray}
                        />
                    </View>

                    {/* 開始時間 */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>開始時間</Text>
                        <DateTimePicker
                            value={startTime}
                            mode="time"
                            textColor="#000000ff"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                            if (date) setStartTime(date);
                            }}
                            style={styles.timePicker}
                        />
                    </View>

                    {/* 結束時間 */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>結束時間</Text>
                        <DateTimePicker
                            value={endTime}
                            mode="time"
                            textColor="#000000ff"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                            if (date) setEndTime(date);
                            }}
                            style={styles.timePicker}
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.white,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    headerTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: FONT_WEIGHTS.semibold,
        color: COLORS.black,
    },
    cancelButton: {
        fontSize: FONT_SIZES.sm,
        color: '#007AFF',
    },
    saveButton: {
        fontSize: FONT_SIZES.sm,
        color: '#007AFF',
        fontWeight: FONT_WEIGHTS.semibold,
    },
    disabledButton: {
        opacity: 0.5,
    },
    form: {
        flex: 1,
        padding: SPACING.lg,
    },
    inputGroup: {
        marginBottom: SPACING.lg,
    },
    label: {
        fontSize: FONT_SIZES.sm,
        fontWeight: FONT_WEIGHTS.semibold,
        color: COLORS.black,
        marginBottom: SPACING.xs,
    },
    textInput: {
        backgroundColor: '#F5F5F5',
        borderRadius: BORDER_RADIUS.sm,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        fontSize: FONT_SIZES.sm,
        color: COLORS.black,
    },
    timePicker: {
        height: 150,
        marginTop: -SPACING.xs,
    },
});
