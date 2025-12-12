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
  Modal,
  Image,
  Alert,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
// ✅ 改回使用 ScreenContainer，恢復原本的佈局邏輯
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

// --- 新功能套件 ---
import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { supabase } from '../lib/supabase';

// ✅ Polyfill
import { decode } from 'base-64';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: string;
  fromMe: boolean;
  isPending?: boolean;
  type?: 'TEXT' | 'IMAGE' | 'TRANSFER';
};

// --- 日期 Helper ---
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
  let suffix = '';
  
  if (isSameDay(isoString, now.toISOString())) {
    suffix = ' (今天)';
  } else {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(isoString, yesterday.toISOString())) {
      suffix = ' (昨天)';
    }
  }

  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}/${m}/${d}${suffix}`;
};

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
  const { coins, refresh } = useCoinsContext();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { setActiveRoomId, clearRoomUnread, unread } = useUnread();

  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const [inputText, setInputText] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadNewMsgCount, setUnreadNewMsgCount] = useState(0);
  const [isTargetOnline, setIsTargetOnline] = useState(false);

  // 新功能 State
  const [isUploading, setIsUploading] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // --- Refs ---
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const historyFetchedRef = useRef(false);
  const currentRoomIdRef = useRef("");

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
    if (roomId) {
      // 1. 進入頁面：告訴 Context 我在這個房間 (擋住震動)
      setActiveRoomId(roomId);
      // 2. 順便清除這個房間原本的紅點
      clearRoomUnread(roomId);
    }

    // 3. 離開頁面 (Unmount)：清除活躍狀態
    return () => {
      setActiveRoomId(null);
    };
  }, [roomId, setActiveRoomId, clearRoomUnread]);

  useEffect(() => {
    if (!user || !roomId) return;

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

    connectChatServer(user.id).then((connected) => {
      if (connected && !historyFetchedRef.current) {
        getChatHistory(roomId, user.id);
        checkUserOnline(targetUserId);
        historyFetchedRef.current = true;
      }
    });

    const listener = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      const detectType = (content: string): 'IMAGE' | 'TRANSFER' | 'TEXT' => {
        if (content.includes('chat-images')) return 'IMAGE';
        if (content.includes('💸 Sent') && content.includes('coins')) return 'TRANSFER';
        return 'TEXT';
      };

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
          type: detectType(row.content),
        }));

        if (rawList.length < 50) setHasMore(false);

        if (msg.requestBefore) {
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

      if (msg.type === 'MESSAGE' && msg.roomId === roomId) {
        const fromMe = msg.senderId === user.id;
        const msgType = detectType(msg.content);

        setMessages((prev) => {
          let pendingIndex = -1;
          if (msg.tempId) {
            pendingIndex = prev.findIndex((m) => m.id === msg.tempId);
          }
          if (pendingIndex === -1 && fromMe) {
             pendingIndex = prev.findIndex(m => m.isPending && m.content === msg.content);
          }

          if (pendingIndex !== -1) {
            const newArr = [...prev];
            newArr[pendingIndex] = {
              ...newArr[pendingIndex],
              id: msg.messageId,
              content: msg.content,
              createdAt: msg.createdAt,
              fromMe: true,
              isPending: false,
              type: msgType,
            };
            return newArr;
          }

          if (prev.some(m => m.id === msg.messageId)) return prev;

          const newMsg: ChatMessage = {
            id: msg.messageId,
            roomId: msg.roomId,
            senderId: msg.senderId,
            content: msg.content,
            createdAt: msg.createdAt,
            fromMe,
            isPending: false,
            type: msgType,
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
          setUnreadNewMsgCount(c => c + 1);
        }
      }

      if (msg.type === 'USER_STATUS' && msg.userId === targetUserId) {
        setIsTargetOnline(msg.isOnline);
      }
      if (msg.type === 'USER_STATUS_CHANGE' && msg.userId === targetUserId) {
        setIsTargetOnline(msg.isOnline);
      }
    };

    addChatListener(listener);
    return () => {
      removeChatListener(listener);
    };
  }, [user?.id, roomId, targetUserId]);

  useEffect(() => {
    if (!showScrollBottom) {
      setUnreadNewMsgCount(0);
    }
  }, [showScrollBottom]);

  // ------------------------------------------------------
  // 功能 1: 圖片上傳
  // ------------------------------------------------------
  const handlePickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.7,
      selectionLimit: 1,
    });

    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      if (!asset.uri) return;
      uploadImage(asset.uri, asset.type || 'image/jpeg');
    }
  };

  // ------------------------------------------------------
  // 功能 1: 圖片上傳 (修正版)
  // ------------------------------------------------------
  const uploadImage = async (uri: string, mimeType: string) => {
    if (!user) return;
    setIsUploading(true);

    try {
      // 1. 讀取檔案為 base64
      const base64 = await RNFS.readFile(uri, 'base64');

      // 2. 將 Base64 轉換為 ArrayBuffer (這是 React Native 上傳圖片的正確姿勢)
      const binaryString = decode(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const fileName = `${user.id}/${Date.now()}.jpg`;

      // 3. 上傳 ArrayBuffer
      const { error } = await supabase.storage
        .from('chat-images')
        .upload(fileName, arrayBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (error) throw error;

      // 4. 取得公開 URL
      const { data: publicData } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName);
      
      handleSend(publicData.publicUrl, 'IMAGE');

    } catch (err: any) {
      console.error('Upload failed', err);
      // 如果是權限錯誤，提示使用者
      if (err.message && err.message.includes('row-level security')) {
         Alert.alert('上傳失敗', '請檢查 Supabase Storage 的權限設定 (RLS Policy)。');
      } else {
         Alert.alert('上傳失敗', '無法上傳圖片，請稍後再試。');
      }
    } finally {
      setIsUploading(false);
    }
  };

  // ------------------------------------------------------
  // 功能 2: 轉帳 (RPC)
  // ------------------------------------------------------
  const handleTransfer = async () => {
    const val = parseInt(transferAmount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('金額無效', '請輸入有效的數字');
      return;
    }
    if (val > coins) {
      Alert.alert('餘額不足', `你目前只有 ${coins} 枚金幣。`);
      return;
    }

    setIsTransferring(true);
    try {
      const { error } = await supabase.rpc('transfer_coins', {
        sender_id: user?.id,
        receiver_id: targetUserId,
        amount: val,
      });

      if (error) throw error;

      const msg = `💸 Sent ${val} coins`;
      handleSend(msg, 'TRANSFER');
      
      if (refresh) refresh();
      setShowTransferModal(false);
      setTransferAmount('');
      Alert.alert('轉帳成功', `已發送 ${val} 金幣給 ${targetUserName}`);

    } catch (err: any) {
      console.error(err);
      Alert.alert('交易失敗', err.message || '發生錯誤，請稍後再試');
    } finally {
      setIsTransferring(false);
    }
  };

  // ------------------------------------------------------
  // 統一發送
  // ------------------------------------------------------
  const handleSend = (content: string, type: 'TEXT' | 'IMAGE' | 'TRANSFER' = 'TEXT') => {
    if (!user || !roomId || !content.trim()) return;

    const tempId = Date.now().toString();

    const pendingMsg: ChatMessage = {
      id: tempId,
      roomId,
      senderId: user.id,
      content: content.trim(),
      createdAt: new Date().toISOString(),
      fromMe: true,
      isPending: true,
      type,
    };

    setMessages((prev) => [pendingMsg, ...prev]);
    if (type === 'TEXT') setInputText('');

    sendChatMessage({
      type: 'SEND_MESSAGE',
      roomId,
      senderId: user.id,
      content: content.trim(),
      tempId,
    });

    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  // ------------------------------------------------------
  // UI Helpers
  // ------------------------------------------------------
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

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const nextItem = messages[index + 1];
    const showDateHeader = !nextItem || !isSameDay(item.createdAt, nextItem.createdAt);
    
    const isImage = item.type === 'IMAGE';
    const isTransfer = item.type === 'TRANSFER';

    return (
      <View style={styles.itemContainer}>
        {showDateHeader && (
          <DateHeader dateLabel={getDateLabel(item.createdAt)} />
        )}

        <View style={[styles.messageBubbleWrapper, item.fromMe ? styles.meWrapper : styles.otherWrapper]}>
          <View
            style={[
              styles.messageBubble,
              item.fromMe ? styles.meBubble : styles.otherBubble,
              { opacity: item.isPending ? 0.6 : 1 },
              isImage && { padding: 0, backgroundColor: 'transparent', borderWidth: 0 }
            ]}
          >
            {isImage ? (
              <Image 
                source={{ uri: item.content }} 
                style={styles.chatImage} 
                resizeMode="cover"
              />
            ) : (
              <Text
                style={[
                  styles.messageText,
                  item.fromMe ? styles.meText : styles.otherText,
                  isTransfer && { color: '#F59E0B', fontWeight: 'bold' }
                ]}
              >
                {item.content}
              </Text>
            )}
            
            <Text style={[styles.timestamp, item.fromMe ? styles.meTimestamp : styles.otherTimestamp]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // ------------------------------------------------------
  // Render
  // ------------------------------------------------------
  return (
    // ✅ 改回 ScreenContainer，這是你原本的排版邏輯
    <ScreenContainer>
      <TopBar 
        coins={coins} 
        onSettingsPress={signOut}
        unreadCount={unread.total}
      />

      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{targetUserName.charAt(0).toUpperCase()}</Text>
            {isTargetOnline && <View style={styles.onlineBadge} />}
          </View>
          <View>
            <Text style={styles.headerTitle}>{targetUserName}</Text>
            <Text style={[styles.headerStatus, { color: isTargetOnline ? '#10B981' : '#9CA3AF' }]}>
              {isTargetOnline ? '在線' : '離線'}
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
            <Text style={styles.loadingText}>載入中...</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              inverted
              contentContainerStyle={styles.messageListContent}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.2}
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
                  <Text style={styles.emptyText}>開始與 {targetUserName} 聊天吧</Text>
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
                  <Text style={styles.newMsgText}>新訊息</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          {/* 照片按鈕 */}
          <TouchableOpacity onPress={handlePickImage} style={styles.actionButton} disabled={isUploading}>
             {isUploading ? <ActivityIndicator size="small" color="#666"/> : <Ionicons name="image-outline" size={24} color="#666" />}
          </TouchableOpacity>

          {/* 轉帳按鈕 */}
          <TouchableOpacity onPress={() => setShowTransferModal(true)} style={styles.actionButton}>
             <Ionicons name="cash-outline" size={24} color="#F59E0B" />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="輸入訊息..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={() => handleSend(inputText, 'TEXT')}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 轉帳 Modal */}
      <Modal visible={showTransferModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>發送金幣</Text>
            <Text style={styles.modalSubtitle}>給: {targetUserName}</Text>
            <Text style={styles.balanceText}>目前餘額: {coins}</Text>
            
            <TextInput 
              style={styles.modalInput}
              keyboardType="number-pad"
              placeholder="輸入金額"
              value={transferAmount}
              onChangeText={setTransferAmount}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowTransferModal(false)}>
                <Text style={{color: '#666'}}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleTransfer} disabled={isTransferring}>
                {isTransferring ? <ActivityIndicator color="#FFF" /> : <Text style={{color: '#FFF', fontWeight:'bold'}}>發送</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  // 移除 safeArea class，因為 ScreenContainer 已經處理了
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
    position: 'relative',
  },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#4F46E5' },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  headerTitle: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: '#1F2937' },
  headerStatus: { fontSize: 12, fontWeight: '500' },

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
    width: '100%',
  },
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
  
  chatImage: {
    width: 200,
    height: 200,
    borderRadius: 10,
    backgroundColor: '#eee',
  },

  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  meTimestamp: { color: '#9CA3AF' },
  otherTimestamp: { color: '#9CA3AF' },

  // Input Area Styles - 這裡稍微調整排版，讓新按鈕不破壞佈局
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButton: {
    padding: 8,
    marginRight: 4,
    justifyContent: 'center',
    height: 44, // 增加高度以方便點擊
    marginBottom: 0, // 對齊 input
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
  newMsgText: { color: '#FFF', fontWeight: 'bold', marginLeft: 6, fontSize: 12 },
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
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 4 },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { textAlign: 'center', color: '#666', marginBottom: 4 },
  balanceText: { textAlign: 'center', color: COLORS.primary, marginBottom: 16, fontWeight: '600' },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalCancel: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginRight: 8,
  },
  modalConfirm: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    marginLeft: 8,
  },
});