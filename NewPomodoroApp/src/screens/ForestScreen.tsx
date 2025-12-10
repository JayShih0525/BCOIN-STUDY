/**
 * ForestScreen
 * 只在「離開頁面」或「時間到 / 按下停止」時更新 Supabase
 */

import React, { use, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation, RouteProp, useIsFocused } from '@react-navigation/native';
import {
  ScreenContainer,
  TopBar,
  TimerDisplay,
  VideoPlayer,
  ActionButton,
} from '../components';
import { useTimer } from '../hooks/useTimer';
import { useCoins } from '../hooks/useCoins';
import { useTimeRecordsContext } from '../context';
import { RootTabParamList } from '../types/navigation';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { TimeRecord } from '../types/timeRecord';
import { useAuth } from '../context/AuthContext';

type ForestScreenRouteProp = RouteProp<RootTabParamList, 'Forest'>;

export const ForestScreen: React.FC = () => {
  const route = useRoute<ForestScreenRouteProp>();
  const navigation = useNavigation();
  const isFocused = useIsFocused(); // ⭐ 偵測是否還在 Forest 頁面
  const { signOut, user } = useAuth();

  const { minutes, seconds, isActive, toggleTimer, setTimeLeft, getElapsedSeconds } = useTimer();
  const { coins, addCoins, refresh: refreshCoins } = useCoins(user?.id ?? null);

  const {
    updateExecutedTime,
    getActiveRecordForCurrentTime,
    getRecordById,
  } = useTimeRecordsContext();

  const taskFromParams = route.params?.activeTask ?? null;
  const [currentTask, setCurrentTask] = useState<TimeRecord | null>(null);

  const activeTaskIdRef = useRef<string | null>(null);
  const hasTimeUpAlertedRef = useRef<boolean>(false);

  /** 計算剩餘秒數 */
  const getRemainingSeconds = (task: TimeRecord): number => {
    const totalSeconds = Math.floor(
      (task.endTime.getTime() - task.startTime.getTime()) / 1000
    );
    return Math.max(0, totalSeconds - (task.executedSeconds ?? 0));
  };

  /** 取得最新的任務資料 */
  const resolveCurrentTask = (): TimeRecord | null => {
    if (taskFromParams) return getRecordById(taskFromParams.id) ?? taskFromParams;
    return getActiveRecordForCurrentTime();
  };

  useEffect(() => {
    if (isFocused) {
      void refreshCoins();
    }
  }, [isFocused, refreshCoins]);

  /** 初始化任務 + 時間 */
  useEffect(() => {
    const task = resolveCurrentTask();
    hasTimeUpAlertedRef.current = false;

    if (task) {
      setCurrentTask(task);
      activeTaskIdRef.current = task.id;

      const remaining = getRemainingSeconds(task);
      setTimeLeft(remaining);

      // 若一進來就已經做完
      if (remaining <= 0) {
        hasTimeUpAlertedRef.current = true;
        Alert.alert("時間到了", "本次任務已結束！");
      }
    } else {
      setCurrentTask(null);
      activeTaskIdRef.current = null;
      setTimeLeft(0);
    }
  }, [taskFromParams]);

  useEffect(() => {
    if (!isFocused || !isActive) return;

    const interval = setInterval(() => {
      console.log("⏱️ +1 coin (10 秒)");
      addCoins(1); // 自動寫進資料庫
    }, 10000); // 10 秒

    // 離開畫面 / 停止計時 → 不再加 coin
    return () => clearInterval(interval);

  }, [isFocused, isActive]);

  /** ⭐ 當時間跑到 0 時顯示 Alert（只顯示一次） */
  useEffect(() => {
    if (!isActive) return;

    const remaining = minutes * 60 + seconds;

    if (remaining <= 0 && !hasTimeUpAlertedRef.current) {
      hasTimeUpAlertedRef.current = true;

      toggleTimer(); // 停止倒數
      setTimeLeft(0);

      Alert.alert("時間到了", "本次任務已結束！");
    }
  }, [minutes, seconds]);

  /** ⭐ 離開 Forest 頁面時 → 更新 Supabase */
  useEffect(() => {
    if (!isFocused) {
      // 已經沒有任務
      if (!activeTaskIdRef.current) return;

      const elapsed = getElapsedSeconds(); // 本次 session 累計秒數
      if (elapsed > 0) {
        // 寫入 DB（累加）
        updateExecutedTime(activeTaskIdRef.current, elapsed);
      }

      // 停止計時器
      if (isActive) toggleTimer();
    }
  }, [isFocused]);

  /** 按 Start / Pause 時的邏輯 */
  const handleToggleTimer = () => {
    if (!activeTaskIdRef.current) {
      Alert.alert("尚無任務", "請先建立任務！");
      return;
    }

    const remaining = minutes * 60 + seconds;

    if (!isActive && remaining <= 0) {
      Alert.alert("時間到了", "本次任務已結束！");
      return;
    }

    toggleTimer();
  };

  const displayTask = activeTaskIdRef.current
    ? getRecordById(activeTaskIdRef.current) || currentTask
    : currentTask;

  return (
    <ScreenContainer>
      <TopBar coins={coins} onSettingsPress={signOut} />

      <View style={styles.container}>
        {displayTask && (
          <View style={styles.taskInfo}>
            <Text style={styles.taskName} numberOfLines={1}>
              {displayTask.name}
            </Text>
          </View>
        )}

        <TimerDisplay minutes={minutes} seconds={seconds} />

        <VideoPlayer
          isPlaying={isActive}
          source={require('../../assets/cuttingTree.mp4')}
        />

        <ActionButton
          title={isActive ? 'Pause' : 'Start'}
          onPress={handleToggleTimer}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 120,
  },
  taskInfo: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  taskName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.black,
  },
});