// src/screens/ChatScreen.tsx

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import { useUnread } from '../context/UnreadContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import type { RootStackParamList } from '../types/navigation';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  chatClient,
  connectChatServer,
  sendChatMessage,
  addChatListener,
  removeChatListener,
  getChatHistory,
  checkUserOnline,
} from '../utils/chatClient';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: string;
  fromMe: boolean;
  isPending?: boolean; // true: 半透明, false: 實心
};

// --- 日期處理 Helper ---
const isSameDay = (d1: string, d2: string) => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const getDateLabel = (isoString: string) => {
  const date = new Date(isoString);
  const now = new Date();
  let returnString = ''
  
  if (isSameDay(isoString, now.toISOString())) {
    returnString =  ' (Today)';
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(isoString, yesterday.toISOString())) {
    returnString = ' (Yesterday)';
  }

  // 格式化為 YYYY/MM/DD
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}/${m}/${d}` + returnString;
};

// --- 日期分隔線組件 ---
const DateHeader: React.FC<{ dateLabel: string }> = ({ dateLabel }) => (
  <View style={styles.dateHeaderContainer}>
    <View style={styles.dateHeaderBadge}>
      <Text style={styles.dateHeaderText}>{dateLabel}</Text>
    </View>
  </View>
);

export const ChatScreen: React.FC = () => {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation();
  const { targetUserId, targetUserName } = route.params;

  const { user, signOut } = useAuth();
  const { coins } = useCoinsContext();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clearRoomUnread } = useUnread();

  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const [inputText, setInputText] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadNewMsgCount, setUnreadNewMsgCount] = useState(0);

  const [isTargetOnline, setIsTargetOnline] = useState(false);

  // --- Refs ---
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const historyFetchedRef = useRef(false);
  const currentRoomIdRef = useRef("");

  // --- Room ID ---
  const roomId = useMemo(() => {
    if (!user) return '';
    return [user.id, targetUserId].sort().join('_');
  }, [user, targetUserId]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // ------------------------------------------------------
  // 核心 Effect
  // ------------------------------------------------------
  useEffect(() => {
    if (!user || !roomId) return;

    // 1. 切換房間重置
    if (currentRoomIdRef.current !== roomId) {
      historyFetchedRef.current = false;
      currentRoomIdRef.current = roomId;
      setMessages([]);
      setIsLoading(true);
      setHasMore(true);
      setIsFetchingMore(false);
      setUnreadNewMsgCount(0);
      setShowScrollBottom(false);
      setIsTargetOnline(false);
    }

    // 2. 連線 & 初始歷史
    connectChatServer(user.id).then((connected) => {
      if (connected && !historyFetchedRef.current) {
        console.log('[ChatScreen] Initial history fetch');
        getChatHistory(roomId, user.id);
        checkUserOnline(targetUserId);
        historyFetchedRef.current = true;
      }
    });

    // 3. 監聽器
    const listener = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      // --- A. 歷史訊息 ---
      if (msg.type === 'HISTORY' && msg.roomId === roomId) {
        const rawList = msg.data || [];
        const mapped: ChatMessage[] = rawList.map((row: any) => ({
          id: row.messageId,
          roomId: row.roomId,
          senderId: row.senderId,
          content: row.content,
          createdAt: row.createdAt,
          fromMe: row.senderId === user.id,
          isPending: false, 
        }));

        if (rawList.length < 50) setHasMore(false);

        const isLoadMore = !!msg.requestBefore;

        if (isLoadMore) {
          setMessages((prev) => [...prev, ...mapped]);
          setIsFetchingMore(false);
        } else {
          setMessages(mapped);
          setIsLoading(false);
          if (mapped.length > 0) {
            chatClient.sendJson({ 
              type: 'MARK_READ', 
              roomId, 
              userId: user.id, 
              lastReadMessageId: mapped[0].id 
            });
          }
        }
      }

      // --- B. 新訊息 (包含自己發送的回傳) ---
      if (msg.type === 'MESSAGE' && msg.roomId === roomId) {
        const fromMe = msg.senderId === user.id;

        setMessages((prev) => {
          // ★★★ 強力替換邏輯 (修復顏色不變回來的問題) ★★★
          
          let pendingIndex = -1;

          // 1. 優先：嘗試用 tempId 尋找
          if (msg.tempId) {
            pendingIndex = prev.findIndex((m) => m.id === msg.tempId);
          }

          // 2. 後備：如果 tempId 沒找到 (例如 Server 沒回傳)，改用「內容 + 發送中狀態」來找
          // 我們假設最新的訊息 (index 0 或 1) 可能是那一則
          if (pendingIndex === -1 && fromMe) {
             pendingIndex = prev.findIndex(m => 
                m.isPending === true && 
                m.content === msg.content && 
                m.senderId === user.id
             );
          }

          // 找到了 -> 原地替換
          if (pendingIndex !== -1) {
            const newArr = [...prev];
            newArr[pendingIndex] = {
              id: msg.messageId,     // 換成正式 ID
              roomId: msg.roomId,
              senderId: msg.senderId,
              content: msg.content,
              createdAt: msg.createdAt,
              fromMe: true,
              isPending: false,      // ★ 變回不透明
            };
            return newArr;
          }

          // 沒找到 -> 當作新訊息插入 (防止重複)
          if (prev.some(m => m.id === msg.messageId)) return prev;

          const newMsg: ChatMessage = {
            id: msg.messageId,
            roomId: msg.roomId,
            senderId: msg.senderId,
            content: msg.content,
            createdAt: msg.createdAt,
            fromMe,
            isPending: false,
          };
          return [newMsg, ...prev];
        });

        if (!fromMe) {
          chatClient.sendJson({ 
            type: 'MARK_READ', 
            roomId, 
            userId: user.id, 
            lastReadMessageId: msg.messageId 
          });
          setUnreadNewMsgCount((prevCount) => prevCount + 1);
        }
      }

      // ★ 新增：處理主動查詢的回應
      if (msg.type === 'USER_STATUS' && msg.userId === targetUserId) {
        setIsTargetOnline(msg.isOnline);
      }

      // ★ 新增：處理即時廣播 (對方剛上線或剛下線)
      if (msg.type === 'USER_STATUS_CHANGE' && msg.userId === targetUserId) {
        setIsTargetOnline(msg.isOnline);
      }
    };

    addChatListener(listener);
    return () => {
      removeChatListener(listener);
    };
  }, [user?.id, roomId, targetUserId]);

  // 清除未讀
  useEffect(() => {
    if (!showScrollBottom) {
      setUnreadNewMsgCount(0);
    }
  }, [showScrollBottom]);

  // ------------------------------------------------------
  // Actions
  // ------------------------------------------------------
  const handleSend = () => {
    if (!user || !roomId || !inputText.trim()) return;

    const content = inputText.trim();
    const tempId = Date.now().toString();

    // 樂觀更新
    const pendingMsg: ChatMessage = {
      id: tempId,
      roomId,
      senderId: user.id,
      content,
      createdAt: new Date().toISOString(),
      fromMe: true,
      isPending: true, 
    };

    setMessages((prev) => [pendingMsg, ...prev]);
    setInputText('');

    sendChatMessage({
      type: 'SEND_MESSAGE',
      roomId,
      senderId: user.id,
      content,
      tempId,
    });

    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY > 300) {
      setShowScrollBottom(true);
    } else {
      setShowScrollBottom(false);
      setUnreadNewMsgCount(0);
    }
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowScrollBottom(false);
    setUnreadNewMsgCount(0);
  };

  const handleLoadMore = () => {
    if (isLoading || isFetchingMore || !hasMore || messages.length === 0) return;
    setIsFetchingMore(true);
    const oldestMsg = messages[messages.length - 1];
    getChatHistory(roomId, user!.id, oldestMsg.createdAt);
  };

  const handleGoBack = () => navigation.goBack();

  // ------------------------------------------------------
  // Render Item (包含日期判斷)
  // ------------------------------------------------------
  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    // 檢查是否需要顯示日期分隔線
    // 因為是 inverted list，index+1 是「上一則」(更舊的)
    const nextItem = messages[index + 1];
    
    // 如果是最後一筆資料 (視覺上的最上方)，或者與下一筆資料的日期不同，就顯示日期
    const showDateHeader = 
      !nextItem || !isSameDay(item.createdAt, nextItem.createdAt);

    return (
      <View style={styles.itemContainer}>
        {/* 日期分隔線 (顯示在 bubble 上方) */}
        {showDateHeader && (
          <DateHeader dateLabel={getDateLabel(item.createdAt)} />
        )}

        <View
          style={[
            styles.messageBubbleWrapper,
            item.fromMe ? styles.meWrapper : styles.otherWrapper,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              item.fromMe ? styles.meBubble : styles.otherBubble,
              { opacity: item.isPending ? 0.5 : 1 }, // 透明度控制
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.fromMe ? styles.meText : styles.otherText,
              ]}
            >
              {item.content}
            </Text>
            <Text
              style={[
                styles.timestamp,
                item.fromMe ? styles.meTimestamp : styles.otherTimestamp,
              ]}
            >
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // ------------------------------------------------------
  // Main Render
  // ------------------------------------------------------
  return (
    <ScreenContainer>
      <TopBar coins={coins} onSettingsPress={signOut} />

      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{targetUserName.charAt(0).toUpperCase()}</Text>
            {/* ★ 選項：在頭像上也加個小綠點 */}
            {isTargetOnline && <View style={styles.onlineBadge} />}
          </View>
          <View>
            <Text style={styles.headerTitle}>{targetUserName}</Text>
            {/* ★ 修改狀態文字與顏色 */}
            <Text style={[
              styles.headerStatus, 
              { color: isTargetOnline ? '#10B981' : '#9CA3AF' } // 綠色 vs 灰色
            ]}>
              {isTargetOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading history...</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id} // ID 改變 (tempId -> uuid) 會觸發重新渲染，這是好事
              inverted
              contentContainerStyle={styles.messageListContent}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.2}
              
              // 使用自定義的 renderItem
              renderItem={renderItem}

              ListFooterComponent={
                isFetchingMore ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={COLORS.gray} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={[styles.emptyContainer, { transform: [{ scaleY: -1 }] }]}>
                  <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyText}>Start chatting with {targetUserName}</Text>
                </View>
              }
            />

            {showScrollBottom && (
              <TouchableOpacity
                style={styles.scrollToBottomButton}
                onPress={scrollToBottom}
                activeOpacity={0.8}
              >
                {unreadNewMsgCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadNewMsgCount}</Text>
                  </View>
                )}
                <Ionicons name="arrow-down" size={20} color="#FFF" />
                {unreadNewMsgCount > 0 && (
                  <Text style={styles.newMsgText}>New Message</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  // ... 基礎樣式
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContainer: {
    flex: 1,
    position: 'relative',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: { padding: 4, marginRight: 8 },
  headerInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#4F46E5' },
  headerTitle: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: '#1F2937' },
  headerStatus: { fontSize: 12, color: '#10B981', fontWeight: '500' },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 10, color: COLORS.gray },

  messageListContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,
    opacity: 0.7,
    flex: 1,
  },
  emptyText: { marginTop: 8, color: '#9CA3AF', fontSize: 14 },

  itemContainer: {
    // 讓 dateHeader 和 messageBubble 包在一起
    width: '100%',
  },
  
  // --- 日期分隔線樣式 ---
  dateHeaderContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateHeaderBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateHeaderText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },

  messageBubbleWrapper: { marginVertical: 4, width: '100%' },
  meWrapper: { alignItems: 'flex-end' },
  otherWrapper: { alignItems: 'flex-start' },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  meBubble: { backgroundColor: COLORS.secondary, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  messageText: { fontSize: 15, lineHeight: 22 },
  meText: { color: '#000000' },
  otherText: { color: '#000000' },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  meTimestamp: { color: '#9CA3AF' },
  otherTimestamp: { color: '#9CA3AF' },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1F2937',
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  sendButtonDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0, elevation: 0 },

  scrollToBottomButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 25,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  newMsgText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 6,
    fontSize: 12,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -5,
    backgroundColor: 'red',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981', // Green
    borderWidth: 2,
    borderColor: '#FFF',
  },
});