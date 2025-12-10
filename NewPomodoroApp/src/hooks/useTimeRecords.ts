/**
 * useTimeRecords Hook
 * 時間記錄管理 Hook（本地版）
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { TimeRecord, TimeRecordFormData } from '../types/timeRecord';
import { useAuth } from '../context/AuthContext';
const { user } = useAuth();

// 生成唯一 ID
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// 檢查時段是否重疊（只看「時間」，不看日期）
const isTimeOverlap = (
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean => {
  const s1 = start1.getHours() * 60 + start1.getMinutes();
  const e1 = end1.getHours() * 60 + end1.getMinutes();
  const s2 = start2.getHours() * 60 + start2.getMinutes();
  const e2 = end2.getHours() * 60 + end2.getMinutes();

  return s1 < e2 && s2 < e1;
};

interface UseTimeRecordsReturn {
  records: TimeRecord[];
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  addRecord: (data: TimeRecordFormData) => boolean;
  updateRecord: (id: string, data: TimeRecordFormData) => boolean;
  deleteRecord: (id: string) => void;
  getRecordsForDate: (date: Date) => TimeRecord[];
  updateExecutedTime: (id: string, additionalSeconds: number) => void;
  getActiveRecordForCurrentTime: () => TimeRecord | null;
  checkTimeConflict: (
    startTime: Date,
    endTime: Date,
    excludeId?: string
  ) => boolean;
}

// ⭐ 可以從外面傳初始資料進來，不傳就用空陣列
export const useTimeRecords = (
  initialRecords: TimeRecord[] = []
): UseTimeRecordsReturn => {
  const [records, setRecords] = useState<TimeRecord[]>(initialRecords);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // 判斷是否為同一天
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  // 檢查同一天內時間是否衝突
  const checkTimeConflict = useCallback(
    (startTime: Date, endTime: Date, excludeId?: string): boolean => {
      const sameDayRecords = records.filter((record) => {
        if (excludeId && record.id === excludeId) return false;
        const recordDate = new Date(record.startTime);
        return isSameDay(recordDate, startTime);
      });

      return sameDayRecords.some((record) =>
        isTimeOverlap(startTime, endTime, record.startTime, record.endTime)
      );
    },
    [records]
  );

  // 新增紀錄
  const addRecord = useCallback(
    (data: TimeRecordFormData): boolean => {
      // 檢查時間衝突
      if (checkTimeConflict(data.startTime, data.endTime)) {
        Alert.alert('時段衝突', '此時段已有其他任務，請選擇其他時間');
        return false;
      }

      const newRecord: TimeRecord = {
        id: generateId(),
        userId: user?.id,
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        executedSeconds: 0, // 新增時執行時間為 0
      };

      setRecords((prev) => [...prev, newRecord]);
      return true;
    },
    [checkTimeConflict]
  );

  // 更新紀錄（會把 executedSeconds 壓在新的長度以內）
  const updateRecord = useCallback(
    (id: string, data: TimeRecordFormData): boolean => {
      if (checkTimeConflict(data.startTime, data.endTime, id)) {
        Alert.alert('時段衝突', '此時段已有其他任務，請選擇其他時間');
        return false;
      }

      setRecords((prev) =>
        prev.map((record) => {
          if (record.id !== id) return record;

          // 新的總秒數（避免 executedSeconds > 任務長度）
          const totalSeconds = Math.max(
            0,
            Math.floor(
              (data.endTime.getTime() - data.startTime.getTime()) / 1000
            )
          );

          const clampedExecuted = Math.min(
            record.executedSeconds,
            totalSeconds
          );

          return {
            ...record,
            name: data.name,
            startTime: data.startTime,
            endTime: data.endTime,
            executedSeconds: clampedExecuted,
          };
        })
      );
      return true;
    },
    [checkTimeConflict]
  );

  // 刪除紀錄
  const deleteRecord = useCallback((id: string) => {
    setRecords((prev) => prev.filter((record) => record.id !== id));
  }, []);

  // 取得某一天的所有紀錄
  const getRecordsForDate = useCallback(
    (date: Date) => {
      return records.filter((record) => {
        const recordDate = new Date(record.startTime);
        return isSameDay(recordDate, date);
      });
    },
    [records]
  );

  // 更新執行時間（簡單累加）
  const updateExecutedTime = useCallback(
    (id: string, additionalSeconds: number) => {
      setRecords((prev) =>
        prev.map((record) => {
          if (record.id !== id) return record;

          const totalSeconds = Math.max(
            0,
            Math.floor(
              (record.endTime.getTime() - record.startTime.getTime()) / 1000
            )
          );

          const newExecuted = Math.min(
            totalSeconds,
            record.executedSeconds + additionalSeconds
          );

          return {
            ...record,
            executedSeconds: newExecuted,
          };
        })
      );
    },
    []
  );

  // 取得目前時間正在進行中的任務
  const getActiveRecordForCurrentTime = useCallback((): TimeRecord | null => {
    const now = new Date();

    const todayRecords = records.filter((record) =>
      isSameDay(new Date(record.startTime), now)
    );

    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return (
      todayRecords.find((record) => {
        const startMinutes =
          record.startTime.getHours() * 60 + record.startTime.getMinutes();
        const endMinutes =
          record.endTime.getHours() * 60 + record.endTime.getMinutes();
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
      }) || null
    );
  }, [records]);

  return {
    records,
    selectedDate,
    setSelectedDate,
    addRecord,
    updateRecord,
    deleteRecord,
    getRecordsForDate,
    updateExecutedTime,
    getActiveRecordForCurrentTime,
    checkTimeConflict,
  };
};