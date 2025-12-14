/**
 * Navigation Types
 * 導航相關的 TypeScript 類型定義
 */

import { TimeRecord } from './timeRecord';

export type RootTabParamList = {
    Calendar: undefined;
    Forest: { activeTask?: TimeRecord } | undefined;
    Guild: undefined;
    Shop: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Tabs: undefined;
  FilterCamera: { filterId?: string } | undefined;
  SchoolDetail: {
    schoolCode: string;
    schoolName: string;
  };
  Chat: {
    roomId?: string;
    targetUserId: string;
    targetUserName: string;
    isGroup?: boolean;
  };
  ChatList: undefined; // ★ 名稱是 ChatList
  Settings: undefined;
};

export type TabScreenName = keyof RootTabParamList;

// 重新匯出 TimeRecord 類型
export * from './timeRecord';