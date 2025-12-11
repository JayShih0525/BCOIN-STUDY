// src/screens/ChatScreen.tsx

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import { useUnread } from '../context/UnreadContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import type { RootStackParamList } from '../types/navigation';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import {
  connectChatServer,
  sendChatMessage,
  addChatListener,
  removeChatListener,
} from '../utils/chatClient';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: string;
  fromMe: boolean;
};

export const ChatScreen: React.FC = () => {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation();
  const { targetUserId, targetUserName } = route.params;

  const { user, signOut } = useAuth();
  const { coins } = useCoinsContext();
  const { clearRoomUnread } = useUnread();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

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

  const sendMarkRead = useCallback(
    (lastMessageId: string) => {
      if (!user || !roomId || !lastMessageId) return;
      const payload = {
        type: 'MARK_READ',
        roomId,
        userId: user.id,
        lastReadMessageId: lastMessageId,
      };
      sendChatMessage(payload);
    },
    [user, roomId],
  );

  const loadHistory = useCallback(async () => {
    if (!user || !roomId) return;

    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, content, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      console.log('[ChatScreen] loadHistory error:', error);
      return;
    }

    const rows = data ?? [];
    const mapped: ChatMessage[] = rows.map((row: any) => ({
      id: row.id,
      roomId: row.room_id,
      senderId: row.sender_id,
      content: row.content,
      createdAt: row.created_at,
      fromMe: row.sender_id === user.id,
    }));

    setMessages(mapped);

    if (mapped.length > 0) {
      const last = mapped[mapped.length - 1];
      sendMarkRead(last.id);
      clearRoomUnread(roomId);
    }
  }, [user, roomId, clearRoomUnread, sendMarkRead]);

  const handleSend = () => {
    if (!user || !roomId) return;
    if (!input.trim()) return;

    const payload = {
      type: 'SEND_MESSAGE',
      roomId,
      senderId: user.id,
      content: input.trim(),
    };

    sendChatMessage(payload);
    setInput('');
    
    // 注意：這裡不需要手動 scrollToEnd，因為我們會靠 useEffect 或 onContentSizeChange 自動處理
  };

  useEffect(() => {
    if (!user || !roomId) return;

    connectChatServer(user.id);

    const listener = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'MESSAGE' && msg.roomId === roomId) {
        const fromMe = msg.senderId === user.id;
        const newMsg: ChatMessage = {
          id: msg.messageId,
          roomId: msg.roomId,
          senderId: msg.senderId,
          content: msg.content,
          createdAt: msg.createdAt,
          fromMe,
        };

        setMessages((prev) => [...prev, newMsg]);

        // 在這個聊天室 → 直接標記已讀
        sendMarkRead(msg.messageId);
        clearRoomUnread(roomId);
      }
    };

    addChatListener(listener);
    return () => {
      removeChatListener(listener);
    };
  }, [user, roomId, sendMarkRead, clearRoomUnread]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ✅ 核心修改：當 messages 變動時，自動捲動到底部
  // 無論是自己發送 (handleSend 更新了 messages) 還是收到訊息 (listener 更新了 messages)
  // 這個 Effect 都會觸發
  useEffect(() => {
    if (messages.length > 0) {
      // 使用 setTimeout 確保畫面渲染完成後再捲動，避免捲動位置不準確
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleGoBack = () => {
    navigation.goBack();
  };

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
          </View>
          <View>
            <Text style={styles.headerTitle}>{targetUserName}</Text>
            <Text style={styles.headerStatus}>Chat</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          data={messages}
          keyExtractor={(item) => item.id}
          // ✅ 核心修改：當內容高度改變（例如新訊息加入導致列表變長）時，自動捲到底部
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          // ✅ 核心修改：當佈局改變（例如鍵盤彈出）時，也嘗試捲動
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
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
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Start chatting with {targetUserName}</Text>
            </View>
          }
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
            // ✅ 優化：當開始輸入時（鍵盤彈起），也可以觸發捲動
            onFocus={() => {
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
            }}
          />
          <TouchableOpacity
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  // ... 樣式保持不變
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#1F2937',
  },
  headerStatus: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },

  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,
    opacity: 0.7,
  },
  emptyText: {
    marginTop: 8,
    color: '#9CA3AF',
    fontSize: 14,
  },

  messageBubbleWrapper: {
    marginVertical: 4,
    width: '100%',
  },
  meWrapper: {
    alignItems: 'flex-end',
  },
  otherWrapper: {
    alignItems: 'flex-start',
  },
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
  meBubble: {
    backgroundColor: COLORS.secondary,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  meText: {
    color: '#FFFFFF',
  },
  otherText: {
    color: '#1F2937',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  meTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherTimestamp: {
    color: '#9CA3AF',
  },

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
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },
});