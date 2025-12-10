/**
 * TimeRecordsContext
 * 管理時間記錄，並同步到 Supabase 的 time_records 資料表
 *
 * ⚠️ 請確認 types/timeRecord.ts 有：
 * export interface TimeRecord {
 *   id: string;
 *   userId: string;          // 新增
 *   name: string;
 *   startTime: Date;
 *   endTime: Date;
 *   executedSeconds: number;
 * }
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { TimeRecord, TimeRecordFormData } from '../types/timeRecord';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext'; // 如果路徑不同自己調整

type TimeRecordsContextValue = {
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  records: TimeRecord[];
  getRecordsForDate: (d: Date) => TimeRecord[];
  addRecord: (data: TimeRecordFormData) => boolean;
  updateRecord: (id: string, data: TimeRecordFormData) => boolean;
  deleteRecord: (id: string) => void;
  updateExecutedTime: (id: string, deltaSeconds: number) => void;
  getActiveRecordForCurrentTime: (now?: Date) => TimeRecord | null;
  getRecordById: (id: string) => TimeRecord | undefined;
};

const TimeRecordsContext = createContext<TimeRecordsContextValue | undefined>(
  undefined
);

// 簡單產生唯一 id（不用 crypto / uuid）
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2);

// Supabase row -> TimeRecord
const mapRowToTimeRecord = (row: any): TimeRecord => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  startTime: new Date(row.start_time),
  endTime: new Date(row.end_time),
  executedSeconds: row.executed_seconds ?? 0,
});

// 計算某一個任務的「總秒數」 = end - start
const getTaskTotalSeconds = (r: TimeRecord) =>
  Math.max(
    0,
    Math.floor((r.endTime.getTime() - r.startTime.getTime()) / 1000)
  );

export const TimeRecordsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [records, setRecords] = useState<TimeRecord[]>([]);

  // 啟動 + user 變動時，從 Supabase 載入「該使用者」所有紀錄
  useEffect(() => {
    if (!user) {
      setRecords([]);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('time_records')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: true });

      if (error) {
        console.warn('❌ 載入 time_records 失敗：', error.message);
        return;
      }

      if (data) {
        setRecords(data.map(mapRowToTimeRecord));
      }
    })();
  }, [user]);

  // 判斷同一天
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  // 只回傳目前 records（本來就只有自己的）中，這一天的紀錄
  const getRecordsForDate = (date: Date): TimeRecord[] =>
    records.filter((r) => isSameDay(r.startTime, date));

  // 1) 新增紀錄：executedSeconds 一律從 0 開始
  const addRecord = (data: TimeRecordFormData): boolean => {
    if (!user) {
      Alert.alert('尚未登入', '請先登入再建立任務。');
      return false;
    }

    const newRecord: TimeRecord = {
      id: generateId(),
      userId: user.id,
      name: data.name,
      startTime: data.startTime,
      endTime: data.endTime,
      executedSeconds: 0, // 剛建立任務，尚未執行
    };

    // 本地先加，UI 立即顯示
    setRecords((prev) => [...prev, newRecord]);

    // 非同步寫入 Supabase
    (async () => {
      const { error } = await supabase
        .from('time_records')
        .insert({
          id: newRecord.id,
          user_id: newRecord.userId,
          name: newRecord.name,
          start_time: newRecord.startTime.toISOString(),
          end_time: newRecord.endTime.toISOString(),
          executed_seconds: newRecord.executedSeconds,
        });

      if (error) {
        console.warn('❌ Supabase 新增失敗：', error.message);
        Alert.alert('Supabase 新增失敗', error.message);
      }
    })();

    return true;
  };

  // 2) 更新紀錄：可以改名稱/時間，executedSeconds 壓在新的總長度上限內
  const updateRecord = (id: string, data: TimeRecordFormData): boolean => {
    if (!user) return false;

    let updatedRecord: TimeRecord | null = null;

    // 先更新本地 state
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const updated: TimeRecord = {
          ...r,
          name: data.name,
          startTime: data.startTime,
          endTime: data.endTime,
        };

        const totalSeconds = getTaskTotalSeconds(updated);
        updated.executedSeconds = Math.min(r.executedSeconds, totalSeconds);

        updatedRecord = updated;
        return updated;
      })
    );

    if (!updatedRecord) return false;

    // 同步更新 Supabase
    (async () => {
      const { error } = await supabase
        .from('time_records')
        .update({
          name: updatedRecord!.name,
          start_time: updatedRecord!.startTime.toISOString(),
          end_time: updatedRecord!.endTime.toISOString(),
          executed_seconds: updatedRecord!.executedSeconds,
        })
        .eq('id', updatedRecord!.id)
        .eq('user_id', user.id);

      if (error) {
        console.warn('❌ Supabase 更新失敗：', error.message);
      }
    })();

    return true;
  };

  // 3) 刪除紀錄
  const deleteRecord = (id: string) => {
    if (!user) return;

    setRecords((prev) => prev.filter((r) => r.id !== id));

    (async () => {
      const { error } = await supabase
        .from('time_records')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.warn('❌ Supabase 刪除失敗：', error.message);
      }
    })();
  };

  // 4) ForestScreen 用：累加 executedSeconds（deltaSeconds 由外面決定）
  const updateExecutedTime = (id: string, deltaSeconds: number) => {
    if (!user || deltaSeconds <= 0) return;

    let newValue = 0;
    let targetId: string | null = null;

    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const totalSeconds = getTaskTotalSeconds(r);
        newValue = Math.min(totalSeconds, r.executedSeconds + deltaSeconds);
        targetId = r.id;

        return { ...r, executedSeconds: newValue };
      })
    );

    (async () => {
      if (!targetId) return;

      const { error } = await supabase
        .from('time_records')
        .update({ executed_seconds: newValue })
        .eq('id', targetId)
        .eq('user_id', user.id);

      if (error) {
        console.warn('❌ Supabase 更新 executed_seconds 失敗：', error.message);
      }
    })();
  };

  // 5) 取得目前時間正在進行中的任務（用於 Forest 自動帶任務）
  const getActiveRecordForCurrentTime = (
    now: Date = new Date()
  ): TimeRecord | null => {
    if (!user) return null;

    const active = records.find(
      (r) =>
        r.userId === user.id &&
        r.startTime <= now &&
        now <= r.endTime
    );
    return active ?? null;
  };

  // 6) 用 id 找到特定紀錄
  const getRecordById = (id: string): TimeRecord | undefined =>
    records.find((r) => r.id === id);

  return (
    <TimeRecordsContext.Provider
      value={{
        selectedDate,
        setSelectedDate,
        records,
        getRecordsForDate,
        addRecord,
        updateRecord,
        deleteRecord,
        updateExecutedTime,
        getActiveRecordForCurrentTime,
        getRecordById,
      }}
    >
      {children}
    </TimeRecordsContext.Provider>
  );
};

export const useTimeRecordsContext = () => {
  const ctx = useContext(TimeRecordsContext);
  if (!ctx) {
    throw new Error('useTimeRecordsContext 必須在 TimeRecordsProvider 裡面使用');
  }
  return ctx;
};