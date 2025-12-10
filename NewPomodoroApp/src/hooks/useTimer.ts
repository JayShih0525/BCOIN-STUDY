/**
 * useTimer Hook
 * 用 timeLeft（剩餘總秒數） + elapsedThisSession（本輪累積秒數）
 */

import { useState, useEffect, useCallback } from 'react';
import { TIMER_INTERVAL } from '../constants/timer';

interface UseTimerReturn {
  minutes: number;
  seconds: number;
  isActive: boolean;
  isWorkTime: boolean;
  setTimeLeft: (totalSeconds: number) => void; // ⭐ 外部設定剩餘秒數 → 更新螢幕時間
  toggleTimer: () => void;
  resetTimer: () => void;
  getElapsedSeconds: () => number;            // ⭐ 取得這一輪累積的秒數
  resetElapsed: () => void;                   // ⭐ 重置這一輪秒數（送 DB 後清空）
}

export const useTimer = (): UseTimerReturn => {
  // 剩餘「總秒數」
  const [timeLeft, setTimeLeftState] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isWorkTime] = useState<boolean>(true); // 目前沒用到，先保留型別
  const [elapsedThisSession, setElapsedThisSession] = useState<number>(0);

  // 顯示用
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // 倒數邏輯：只有在 isActive = true 時才跑，每次 -1 秒並累加 elapsedThisSession
  useEffect(() => {
    if (!isActive) return;

    const id = setInterval(() => {
      setTimeLeftState((prev) => {
        if (prev <= 1) {
          // 下一步會變 0，順便關掉計時器
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });

      // 本輪累積秒數 +1
      setElapsedThisSession((prev) => prev + 1);
    }, TIMER_INTERVAL); // 通常是 1000ms

    return () => clearInterval(id);
  }, [isActive]);

  // ⭐ 真正「主動更新螢幕時間」的入口：設定剩餘秒數（秒）
  const setTimeLeft = useCallback((totalSeconds: number) => {
    const safe = Math.max(0, Math.floor(totalSeconds));
    setTimeLeftState(safe);
  }, []);

  const toggleTimer = useCallback(() => {
    setIsActive((prev) => {
      const next = !prev;
      // 從「停止 → 開始」時，重新計算本輪秒數
      if (!prev && next) {
        setElapsedThisSession(0);
      }
      return next;
    });
  }, []);

  const resetTimer = useCallback(() => {
    setIsActive(false);
    setTimeLeftState(0);
    setElapsedThisSession(0);
  }, []);

  const getElapsedSeconds = useCallback(() => elapsedThisSession, [elapsedThisSession]);

  const resetElapsed = useCallback(() => {
    setElapsedThisSession(0);
  }, []);

  return {
    minutes,
    seconds,
    isActive,
    isWorkTime,
    setTimeLeft,
    toggleTimer,
    resetTimer,
    getElapsedSeconds,
    resetElapsed,
  };
};