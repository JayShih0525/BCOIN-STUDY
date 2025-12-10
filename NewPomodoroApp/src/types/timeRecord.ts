/**
 * TimeRecord Types
 * 時間記錄相關類型定義
 */

export interface TimeRecord {
    id: string;
    userId: string | undefined;
    name: string;
    startTime: Date;
    endTime: Date;
    executedSeconds: number; // 已執行的總秒數
}

export interface TimeRecordFormData {
    name: string;
    startTime: Date;
    endTime: Date;
}

// 格式化已執行時間的顯示
export const formatExecutedTime = (totalSeconds: number): string => {
    if (totalSeconds === 0) {
        return '0 分 0 秒';
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        if (minutes > 0) {
            return `${hours} 小時 ${minutes} 分`;
        }
        return `${hours} 小時`;
    }

    if (minutes > 0) {
        if (seconds > 0) {
            return `${minutes} 分 ${seconds} 秒`;
        }
        return `${minutes} 分`;
    }

    return `${seconds} 秒`;
};
