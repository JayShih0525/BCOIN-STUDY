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
import Ionicons from 'react-native-vector-icons/Ionicons';

import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import { useUnread } from '../context/UnreadContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';

import {
  chatClient,
  connectChatServer,
  sendChatMessage,
  addChatListener,
  removeChatListener,
  getChatHistory,
  checkUserOnline,
} from '../utils/chatClient';

import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { supabase } from '../lib/supabase';
import { getAvatarUrl } from '../utils/avatar';
import { decode } from 'base-64';

type RootStackParamList = {
  Chat: {
    // ✅ 你可以從 ChatList 傳 roomId；或只傳 targetUserId 讓 ChatScreen 自己 ensure
    roomId?: string;
    targetUserId: string;
    targetUserName: string;
    isGroup?: boolean;
  };
};

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
  isServer?: boolean;
};

// --- 日期 Helper ---
const isSameDay = (iso1: string, iso2: string) => {
  const d1 = new Date(iso1);
  const d2 = new Date(iso2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
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
    if (isSameDay(isoString, yesterday.toISOString())) suffix = ' (昨天)';
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
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
  const navigation = useNavigation<any>();

  const { roomId: routeRoomId, targetUserId, targetUserName, isGroup = false } = route.params;

  const { user, signOut } = useAuth();
  const { coins, refresh } = useCoinsContext();
  const { setActiveRoomId, clearRoomUnread, unread } = useUnread();

  // --- State ---
  const [roomId, setRoomId] = useState<string>(routeRoomId || '');
  const [roomReady, setRoomReady] = useState<boolean>(!!routeRoomId || isGroup); // group 也可以直接用 routeRoomId
  const [targetAvatarUrl, setTargetAvatarUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [inputText, setInputText] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadNewMsgCount, setUnreadNewMsgCount] = useState(0);
  const [isTargetOnline, setIsTargetOnline] = useState(false);

  // 上傳 / 轉帳
  const [isUploading, setIsUploading] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // --- Refs ---
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const historyFetchedRef = useRef(false);
  const currentRoomIdRef = useRef<string>('');

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ------------------------------------------------------
  // ✅ 1) 進頁面先確保 roomId（只對 1v1）
  // ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user || !targetUserId) return;

      // 1. 異步：獲取目標用戶頭像
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('avatar_url')
          .eq('user_id', targetUserId)
          .single();
        
        if (!cancelled && data && data.avatar_url) {
          setTargetAvatarUrl(data.avatar_url);
        } else if (!cancelled) {
          // 如果 DB 沒有頭像，使用回退邏輯 (DiceBear/隨機頭像)
          setTargetAvatarUrl(getAvatarUrl(targetUserId));
        }

        if (error && error.code !== 'PGRST116') { // 忽略單筆查詢找不到的錯誤
          console.error('Failed to fetch avatar:', error);
        }
      } catch (e) {
        console.error('Avatar fetch exception:', e);
        if (!cancelled) {
          // 發生異常，使用回退邏輯
          setTargetAvatarUrl(getAvatarUrl(targetUserId));
        }
      }


      // 2. 處理房間邏輯
      if (isGroup || routeRoomId) {
        if (!cancelled && !roomId) {
          setRoomId(routeRoomId!);
          setRoomReady(true);
        }
        return;
      }

      // 1對1：確保房間存在
      try {
        console.log('[ChatScreen] ensure_one_to_one_room...');
        const { data, error } = await supabase.rpc('ensure_one_to_one_room', {
          p_user1_id: user.id,
          p_user2_id: targetUserId,
        });

        if (error) throw error;

        const ensuredRoomId = typeof data === 'string' ? data : String(data);

        if (!cancelled) {
          setRoomId(ensuredRoomId);
          setRoomReady(true);
        }
      } catch (e: any) {
        console.error('[ChatScreen] ensure_one_to_one_room error', e);
        Alert.alert('錯誤', e?.message || '無法建立/取得聊天室');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, targetUserId, isGroup, routeRoomId, roomId]); // 這裡的 roomId 是必要的依賴項，確保邏輯的順序性

  // ------------------------------------------------------
  // ✅ 2) Room Context (未讀)
  // ------------------------------------------------------
  useEffect(() => {
    if (!roomReady || !roomId) return;
    setActiveRoomId(roomId);
    clearRoomUnread(roomId);

    return () => {
      setActiveRoomId(null);
    };
  }, [roomReady, roomId, setActiveRoomId, clearRoomUnread]);

  // ------------------------------------------------------
  // ✅ 3) reset 當 roomId 變了（避免切換聊天室殘留）
  // ------------------------------------------------------
  useEffect(() => {
    if (!roomReady || !roomId) return;

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
  }, [roomReady, roomId]);

  // ------------------------------------------------------
  // ✅ 4) Connect TCP + 取 history + listener
  // ------------------------------------------------------
  useEffect(() => {
    if (!user || !roomReady || !roomId) return;

    let removed = false;

    connectChatServer(user.id).then((connected) => {
      if (!connected || removed) return;

      // 第一次進來抓 history
      if (!historyFetchedRef.current) {
        getChatHistory(roomId, user.id);
        checkUserOnline(targetUserId);
        historyFetchedRef.current = true;
      }
    });

    const detectType = (content: string): 'IMAGE' | 'TRANSFER' | 'TEXT' => {
      if (content.includes('chat-images')) return 'IMAGE';
      if (content.includes('💸 Sent') && content.includes('coins')) return 'TRANSFER';
      return 'TEXT';
    };

    const listener = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      // -------------- HISTORY --------------
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
          isServer: row.isServer,
        }));

        // 小於 50 視為到底了（依你 server 回傳策略調）
        if (rawList.length < 50) setHasMore(false);

        // requestBefore 表示是 “載入更舊”
        if (msg.requestBefore) {
          setMessages((prev) => [...prev, ...mapped]);
          setIsFetchingMore(false);
        } else {
          setMessages(mapped);
          setIsLoading(false);

          // 初次載入後：mark read（最上面那筆是最新，因為你 inverted + [new,...prev]）
          if (mapped.length > 0) {
            chatClient.sendJson({
              type: 'MARK_READ',
              roomId,
              userId: user.id,
              lastReadMessageId: mapped[0].id,
            });
          }
        }
      }

      // -------------- MESSAGE --------------
      if (msg.type === 'MESSAGE' && msg.roomId === roomId) {
        const fromMe = msg.senderId === user.id;
        const msgType = detectType(msg.content);

        setMessages((prev) => {
          // 找 pending 替換（tempId）
          let pendingIndex = -1;
          if (msg.tempId) pendingIndex = prev.findIndex((m) => m.id === msg.tempId);

          // fallback: fromMe 且內容相同（避免 server 沒回 tempId）
          if (pendingIndex === -1 && fromMe) {
            pendingIndex = prev.findIndex((m) => m.isPending && m.content === msg.content);
          }

          if (pendingIndex !== -1) {
            const next = [...prev];
            next[pendingIndex] = {
              ...next[pendingIndex],
              id: msg.messageId,
              createdAt: msg.createdAt,
              isPending: false,
              type: msgType,
              isServer: msg.isServer,
            };
            return next;
          }

          // 去重
          if (prev.some((m) => m.id === msg.messageId)) return prev;

          const newMsg: ChatMessage = {
            id: msg.messageId,
            roomId: msg.roomId,
            senderId: msg.senderId,
            content: msg.content,
            createdAt: msg.createdAt,
            fromMe,
            isPending: false,
            type: msgType,
            isServer: msg.isServer,
          };

          return [newMsg, ...prev];
        });

        // 非自己訊息：自動 mark read + badge
        if (!fromMe) {
          chatClient.sendJson({
            type: 'MARK_READ',
            roomId,
            userId: user.id,
            lastReadMessageId: msg.messageId,
          });
          setUnreadNewMsgCount((c) => c + 1);
        }
      }

      // -------------- online status --------------
      if (msg.type === 'USER_STATUS' && msg.userId === targetUserId) {
        setIsTargetOnline(msg.isOnline);
      }
      if (msg.type === 'USER_STATUS_CHANGE' && msg.userId === targetUserId) {
        setIsTargetOnline(msg.isOnline);
      }
    };

    addChatListener(listener);
    return () => {
      removed = true;
      removeChatListener(listener);
    };
  }, [user?.id, roomReady, roomId, targetUserId]);

  // ------------------------------------------------------
  // Actions
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

  const uploadImage = async (uri: string, mimeType: string) => {
    if (!user || !roomId) return;
    setIsUploading(true);
    try {
      const base64 = await RNFS.readFile(uri, 'base64');
      const binaryString = decode(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

      const fileName = `${user.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from('chat-images')
        .upload(fileName, bytes.buffer, { contentType: mimeType, upsert: false });

      if (error) throw error;

      const { data: publicData } = supabase.storage.from('chat-images').getPublicUrl(fileName);
      handleSend(publicData.publicUrl, 'IMAGE');
    } catch (err: any) {
      console.error('Upload failed', err);
      Alert.alert('上傳失敗', err?.message || '無法上傳圖片，請稍後再試。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTransfer = async () => {
    if (!user || !roomId) return;

    const val = parseInt(transferAmount, 10);
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
        sender_id: user.id,
        receiver_id: targetUserId,
        amount: val,
      });
      if (error) throw error;

      const msg = `💸 Sent ${val} coins`;
      // 轉帳訊息：你原本用 isServer=true 但要顯示在氣泡上
      handleSend(msg, 'TRANSFER', true);

      if (refresh) refresh();
      setShowTransferModal(false);
      setTransferAmount('');
      Alert.alert('轉帳成功', `已發送 ${val} 金幣給 ${targetUserName}`);
    } catch (err: any) {
      console.error(err);
      Alert.alert('交易失敗', err?.message || '發生錯誤，請稍後再試');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleSend = (content: string, type: 'TEXT' | 'IMAGE' | 'TRANSFER' = 'TEXT', isServer = false) => {
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
      isServer,
    };

    setMessages((prev) => [pendingMsg, ...prev]);
    if (type === 'TEXT') setInputText('');

    sendChatMessage({
      type: 'SEND_MESSAGE',
      roomId,
      senderId: user.id,
      content: pendingMsg.content,
      tempId,
      isServer,
    });

    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  // ------------------------------------------------------
  // UI Helpers
  // ------------------------------------------------------
  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollBottom(offsetY > 300);
    if (offsetY <= 300) setUnreadNewMsgCount(0);
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

  const isTransferText = (content: string) => content.includes('💸 Sent') && content.includes('coins');
  const isImageUrl = (content: string) => content.includes('chat-images');

  // ------------------------------------------------------
  // Render Item
  // ------------------------------------------------------
  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const nextItem = messages[index + 1];
    const showDateHeader = !nextItem || !isSameDay(item.createdAt, nextItem.createdAt);

    // 三分類（照你原本規則）
    const isTransfer = !!item.isServer && isTransferText(item.content);
    const isSystem = !!item.isServer && !isTransfer;
    const isImage = isImageUrl(item.content) || item.type === 'IMAGE';

    // 系統訊息：置中
    if (isSystem) {
      return (
        <View style={styles.itemContainer}>
          {showDateHeader && <DateHeader dateLabel={getDateLabel(item.createdAt)} />}
          <View style={styles.systemMessageContainer}>
            <Text style={styles.systemMessageText}>{item.content}</Text>
          </View>
        </View>
      );
    }

    // 一般訊息 or 轉帳訊息：左右氣泡
    return (
      <View style={styles.itemContainer}>
        {showDateHeader && <DateHeader dateLabel={getDateLabel(item.createdAt)} />}

        <View style={[styles.messageBubbleWrapper, item.fromMe ? styles.meWrapper : styles.otherWrapper]}>
          <View
            style={[
              styles.messageBubble,
              isTransfer ? styles.transferBubble : item.fromMe ? styles.meBubble : styles.otherBubble,
              { opacity: item.isPending ? 0.6 : 1 },
              isImage && { padding: 0, backgroundColor: 'transparent', borderWidth: 0 },
            ]}
          >
            {isImage ? (
              <Image source={{ uri: item.content }} style={styles.chatImage} resizeMode="cover" />
            ) : (
              <Text
                style={[
                  styles.messageText,
                  isTransfer ? styles.transferText : item.fromMe ? styles.meText : styles.otherText,
                ]}
              >
                {item.content}
              </Text>
            )}

            <Text
              style={[
                styles.timestamp,
                item.fromMe ? styles.meTimestamp : styles.otherTimestamp,
                isTransfer && { color: 'rgba(180, 83, 9, 0.7)' },
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
  // Render
  // ------------------------------------------------------
  return (
    <ScreenContainer>
      <TopBar coins={coins} onSettingsPress={signOut} unreadCount={unread.total} />

      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.black} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: getAvatarUrl(targetUserId) }} style={styles.avatarImage} resizeMode="cover" />
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
        {!roomReady ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>建立聊天室中...</Text>
          </View>
        ) : isLoading ? (
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
              <TouchableOpacity style={styles.scrollToBottomButton} onPress={scrollToBottom} activeOpacity={0.8}>
                {unreadNewMsgCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadNewMsgCount}</Text>
                  </View>
                )}
                <Ionicons name="arrow-down" size={20} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={handlePickImage} style={styles.actionButton} disabled={isUploading || !roomReady}>
            {isUploading ? (
              <ActivityIndicator size="small" color="#666" />
            ) : (
              <Ionicons name="image-outline" size={24} color="#666" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowTransferModal(true)}
            style={styles.actionButton}
            disabled={!roomReady || isGroup}
          >
            <Ionicons name="cash-outline" size={24} color={isGroup ? '#D1D5DB' : '#F59E0B'} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={roomReady ? '輸入訊息...' : '聊天室準備中...'}
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
            editable={roomReady}
          />

          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || !roomReady) && styles.sendButtonDisabled]}
            onPress={() => handleSend(inputText, 'TEXT')}
            disabled={!inputText.trim() || !roomReady}
          >
            <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Transfer Modal */}
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
                <Text style={{ color: '#666' }}>取消</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={handleTransfer}
                disabled={isTransferring}
              >
                {isTransferring ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>發送</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  listContainer: { flex: 1, position: 'relative' },

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
  headerTitle: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: '#1F2937' },
  headerStatus: { fontSize: 12, fontWeight: '500' },

  avatarContainer: { width: 40, height: 40, marginRight: 10, position: 'relative' },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
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

  messageListContent: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: COLORS.gray },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 50, opacity: 0.7, flex: 1 },
  emptyText: { marginTop: 8, color: '#9CA3AF', fontSize: 14 },

  itemContainer: { width: '100%' },
  dateHeaderContainer: { alignItems: 'center', marginVertical: 12 },
  dateHeaderBadge: { backgroundColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  dateHeaderText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },

  systemMessageContainer: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 20, width: '100%' },
  systemMessageText: {
    fontSize: 12,
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
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

  transferBubble: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1 },
  transferText: { color: '#B45309', fontWeight: 'bold' },

  messageText: { fontSize: 15, lineHeight: 22 },
  meText: { color: '#000000' },
  otherText: { color: '#000000' },

  chatImage: { width: 200, height: 200, borderRadius: 10, backgroundColor: '#eee' },

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
  actionButton: { padding: 8, marginRight: 4, justifyContent: 'center', height: 44 },
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#FFF', borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { textAlign: 'center', color: '#666', marginBottom: 4 },
  balanceText: { textAlign: 'center', color: COLORS.primary, marginBottom: 16, fontWeight: '600' },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 20, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalCancel: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, marginRight: 8 },
  modalConfirm: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 8, marginLeft: 8 },
});