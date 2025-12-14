/**
 * ForestScreen
 * 只在「離開頁面」或「時間到 / 按下停止」時，正確累加執行時間 & 加 coin
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { useCoinsContext } from '../context/CoinsContext';
import { useTimeRecordsContext } from '../context';
import { RootTabParamList } from '../types/navigation';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { TimeRecord } from '../types/timeRecord';
import { useAuth } from '../context/AuthContext';
import { useUnread } from '../context/UnreadContext';     // 用來拿未讀數字
import { useChatConnectOnFocus } from '../utils/chatClient';

type ForestScreenRouteProp = RouteProp<RootTabParamList, 'Forest'>;

export const ForestScreen: React.FC = () => {
  const route = useRoute<ForestScreenRouteProp>();
  const isFocused = useIsFocused();
  const { signOut, user } = useAuth();
  const { unread } = useUnread();
  useChatConnectOnFocus(user?.id);

  const {
    minutes,
    seconds,
    isActive,
    toggleTimer,
    setTimeLeft,
    getAndResetElapsedSeconds,  // ✅ 改這裡
    resetTimer,                 // ✅ 新增
  } = useTimer();

  const { coins, addCoins } = useCoinsContext();

  const {
    updateExecutedTime,
    getActiveRecordForCurrentTime,
    getRecordById,
  } = useTimeRecordsContext();

  const taskFromParams = route.params?.activeTask ?? null;
  const [currentTask, setCurrentTask] = useState<TimeRecord | null>(null);

  const activeTaskIdRef = useRef<string | null>(null);
  const hasTimeUpAlertedRef = useRef<boolean>(false);

  // ⭐ 用來避免重複累加 executedSeconds
  const lastSavedElapsedRef = useRef<number>(0);
  const hasRunSinceLastSaveRef = useRef<boolean>(false);

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

  /** 初始化任務 + 時間 */
  useEffect(() => {
    const task = resolveCurrentTask();
    hasTimeUpAlertedRef.current = false;

    if (task) {
      setCurrentTask(task);
      activeTaskIdRef.current = task.id;

      const remaining = getRemainingSeconds(task);
      setTimeLeft(remaining);

      // 初始化 elapsed（這次 session 一開始算 0）
      hasRunSinceLastSaveRef.current = false;

      // 若一進來就已經做完
      if (remaining <= 0) {
        hasTimeUpAlertedRef.current = true;
        Alert.alert('時間到了', '本次任務已結束！');
      }
    } else {
      setCurrentTask(null);
      activeTaskIdRef.current = null;
      setTimeLeft(0);
      lastSavedElapsedRef.current = 0;
      hasRunSinceLastSaveRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskFromParams]);

  /** 監聽 isActive，只要有啟動過一次就標記 hadRun */
  useEffect(() => {
    if (isActive) {
      hasRunSinceLastSaveRef.current = true;
    }
  }, [isActive]);

  /** 每 10 秒加一次 coin（只有在畫面在前景 + 計時器啟動時） */
  useEffect(() => {
    if (!isFocused || !isActive) return;

    const interval = setInterval(() => {
      console.log('⏱️ +1 coin (10 秒)');
      addCoins(10); 
    }, 10_000);

    return () => clearInterval(interval);
  }, [isFocused, isActive, addCoins]);

  useEffect(() => {
    if (!isActive) return;

    const remaining = minutes * 60 + seconds;

    if (remaining <= 0 && !hasTimeUpAlertedRef.current) {
      hasTimeUpAlertedRef.current = true;

      // 先把這一段跑完的秒數寫回去
      if (activeTaskIdRef.current) {
        const delta = getAndResetElapsedSeconds();
        if (delta > 0) {
          updateExecutedTime(activeTaskIdRef.current, delta);
        }
      }

      toggleTimer(); // 停止倒數
      setTimeLeft(0);

      Alert.alert("時間到了", "本次任務已結束！");
    }
  }, [minutes, seconds, isActive, getAndResetElapsedSeconds, updateExecutedTime]);

  /** 離開 Forest 頁面時 → 只把「新增的秒數」寫進 Supabase */
  useEffect(() => {
    if (!isFocused) {
      // 沒任務就清掉 timer 即可
      if (!activeTaskIdRef.current) {
        resetTimer();
        return;
      }

      // 取出這一段 session 的秒數（只會算有在跑的秒）
      const elapsed = getAndResetElapsedSeconds();
      if (elapsed > 0) {
        updateExecutedTime(activeTaskIdRef.current, elapsed);
      }

      // 保險：把 timer 停掉
      if (isActive) {
        toggleTimer();
      }
    }
  }, [isFocused, isActive, getAndResetElapsedSeconds, resetTimer, updateExecutedTime]);

  /** 按 Start / Pause 時的邏輯 */
  const handleToggleTimer = () => {
    if (!activeTaskIdRef.current) {
      Alert.alert("尚無任務", "請先建立任務！");
      return;
    }

    const remaining = minutes * 60 + seconds;

    // 準備要從「未在跑 -> 開始跑」
    if (!isActive) {
      if (remaining <= 0) {
        Alert.alert("時間到了", "本次任務已結束！");
        return;
      }
      // 開始跑之前，把本次 session 歸零（可能是舊的）
      getAndResetElapsedSeconds();
      toggleTimer();
      return;
    }

    // 準備從「跑 -> 暫停」：把這一段的秒數加回去
    const delta = getAndResetElapsedSeconds();
    if (delta > 0) {
      updateExecutedTime(activeTaskIdRef.current, delta);
    }
    toggleTimer();
  };

  const displayTask = activeTaskIdRef.current
    ? getRecordById(activeTaskIdRef.current) || currentTask
    : currentTask;

  return (
    <ScreenContainer>
      <TopBar 
        coins={coins} 
        onSettingsPress={signOut}
        unreadCount={unread.total}
      />

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