// src/hooks/useTimer.ts
import { useCallback, useEffect, useRef, useState } from 'react';

type UseTimerReturn = {
  minutes: number;
  seconds: number;
  isActive: boolean;
  setTimeLeft: (seconds: number) => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  /** 取得這一段 session 的累積秒數，並且歸零 */
  getAndResetElapsedSeconds: () => number;
};

export const useTimer = (): UseTimerReturn => {
  const [timeLeft, setTimeLeftState] = useState(0);     // 剩餘秒數
  const [isActive, setIsActive] = useState(false);      // 是否正在跑
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);                         // 這一段 session 累積的秒數

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const setTimeLeft = useCallback((seconds: number) => {
    setTimeLeftState(seconds);
    // 每次指定新的剩餘時間，就把本次 session 的已執行秒數歸零
    elapsedRef.current = 0;
  }, []);

  const toggleTimer = useCallback(() => {
    setIsActive(prev => !prev);
  }, []);

  const resetTimer = useCallback(() => {
    clear();
    setIsActive(false);
    elapsedRef.current = 0;
    setTimeLeftState(0);
  }, []);

  const getAndResetElapsedSeconds = useCallback(() => {
    const val = elapsedRef.current;
    elapsedRef.current = 0;
    return val;
  }, []);

  useEffect(() => {
    // 沒在跑就不要開 interval
    if (!isActive) {
      clear();
      return;
    }

    // 如果已經沒時間了，直接停
    if (timeLeft <= 0) {
      clear();
      setIsActive(false);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeftState(prev => {
        if (prev <= 1) {
          // 最後一秒，歸零並停止
          clear();
          setIsActive(false);
          elapsedRef.current += 1; // 最後這一秒也算
          return 0;
        }
        elapsedRef.current += 1;
        return prev - 1;
      });
    }, 1000);

    return clear;
  }, [isActive]); // ⚠️ 不要把 timeLeft 放進來，避免重複建立 interval

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return {
    minutes,
    seconds,
    isActive,
    setTimeLeft,
    toggleTimer,
    resetTimer,
    getAndResetElapsedSeconds,
  };
};