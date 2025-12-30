import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useUnread } from '../context/UnreadContext';
import { useCoinsContext } from '../context/CoinsContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';

// TCP chat client
import { connectChatServer, addChatListener, removeChatListener } from '../utils/chatClient';

// ------------------------------
// Types
// ------------------------------
interface ChatRoomSummary {
  roomId: string;
  name: string;
  lastMessage?: string | null;
  lastMessageTime?: string | null;
  isGroup: boolean;
  targetUserId?: string | null;
  avatarUrl?: string | null; // ✅ 用於：私聊對方頭貼、或群組頭貼
}

interface SupabaseChatRoomSummary {
  room_id: string;
  name: string;
  is_group: boolean;
  target_user_id?: string | null;
  last_message?: string | null;
  last_message_time?: string | null;

  // ✅ 若你後端 RPC 已經願意回這個欄位，就會直接用（沒有也沒關係）
  avatar_url?: string | null;
}

// ------------------------------
// Component
// ------------------------------
export const ChatListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { unread, clearRoomUnread } = useUnread();
  const { coins } = useCoinsContext();

  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewContent, setPreviewContent] = useState<ChatRoomSummary | null>(null);

  const didInitialLoadRef = useRef(false);
  const isFetchingRef = useRef(false);
  const listenerRef = useRef<((msg: any) => void) | null>(null);

  // ------------------------------
  // Helpers
  // ------------------------------
  const formatListTime = (iso?: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
  };

  // ✅ ChatScreen 同款 dicebear fallback
  const fallbackAvatar = useCallback((seed: string) => {
    const encodedSeed = encodeURIComponent(seed || 'default');
    return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${encodedSeed}&backgroundColor=transparent`;
  }, []);

  // ✅ 更穩的圖片判斷（支援 querystring、jpeg/webp/gif）
  const isImageUrl = (content?: string | null) => {
    if (!content) return false;
    const s = content.trim();

    if (s.includes('/storage/v1/object/public/chat-images/')) return true;

    if (!/^https?:\/\//i.test(s)) return false;
    return /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(s);
  };

  const displayLastMessage = (item: ChatRoomSummary) => {
    if (!item.lastMessage) return '尚無訊息';
    if (isImageUrl(item.lastMessage)) return '[相片]';
    return item.lastMessage.trim();
  };

  // ✅ 群組頭貼的顯示 URL：有就用，沒有就 fallback（Image）
  const getGroupAvatarUri = useCallback(
    (item: ChatRoomSummary) => {
      const v = (item.avatarUrl ?? '').trim();
      const valid = v.length > 0 && v !== 'NULL';
      if (valid) return v;

      // 用 roomId / 群名當 seed 都可以
      return fallbackAvatar(item.roomId || item.name || 'group');
    },
    [fallbackAvatar]
  );

  // ------------------------------
  // 1) Fetch Rooms
  // ------------------------------
  const fetchRooms = useCallback(
    async (isPullToRefresh = false) => {
      if (!user?.id) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (!isPullToRefresh) setLoading(true);

      try {
        const { data, error } = await supabase.rpc('get_user_chat_list', {
          p_user_id: user.id,
        });

        if (error) {
          console.error('[get_user_chat_list] RPC Error:', error);
          throw error;
        }

        const realRooms = (data ?? []) as SupabaseChatRoomSummary[];

        // 先建 baseRooms（先把 RPC 的 avatar_url（若存在）帶進來）
        const baseRooms: ChatRoomSummary[] = realRooms.map((row) => ({
          roomId: row.room_id,
          name: row.name,
          isGroup: !!row.is_group,
          targetUserId: row.target_user_id ?? null,
          lastMessage: row.last_message ?? null,
          lastMessageTime: row.last_message_time ?? null,
          avatarUrl: row.avatar_url ?? null,
        }));

        // --------------------------
        // A) 私聊：批量查對方頭像 user_profiles
        // --------------------------
        const targetIds = Array.from(
          new Set(
            baseRooms
              .filter((r) => !r.isGroup && r.targetUserId)
              .map((r) => r.targetUserId!) as string[]
          )
        );

        if (targetIds.length > 0) {
          const { data: profiles, error: pErr } = await supabase
            .from('user_profiles')
            .select('user_id, avatar_url')
            .in('user_id', targetIds);

          if (!pErr && profiles) {
            const map = new Map<string, string | null>();
            profiles.forEach((p: any) => map.set(p.user_id, p.avatar_url ?? null));

            baseRooms.forEach((r) => {
              if (!r.isGroup && r.targetUserId) {
                // 只覆蓋私聊用
                r.avatarUrl = map.get(r.targetUserId) ?? null;
              }
            });
          }
        }

        // --------------------------
        // B) 群組：如果 RPC 沒回 avatar_url，就批次查 chat_rooms.avatar_url
        // --------------------------
        const groupRoomIdsNeedingAvatar = baseRooms
          .filter((r) => r.isGroup)
          .filter((r) => {
            const v = (r.avatarUrl ?? '').trim();
            return !(v.length > 0 && v !== 'NULL');
          })
          .map((r) => r.roomId);

        // 注意：即使 RPC 沒回 avatar_url，這裡也會補齊
        if (groupRoomIdsNeedingAvatar.length > 0) {
          const { data: groupRooms, error: gErr } = await supabase
            .from('chat_rooms')
            .select('id, avatar_url')
            .in('id', groupRoomIdsNeedingAvatar);

          if (!gErr && groupRooms) {
            const gMap = new Map<string, string | null>();
            groupRooms.forEach((gr: any) => gMap.set(String(gr.id), gr.avatar_url ?? null));

            baseRooms.forEach((r) => {
              if (r.isGroup) {
                const current = (r.avatarUrl ?? '').trim();
                const valid = current.length > 0 && current !== 'NULL';
                if (!valid) r.avatarUrl = gMap.get(r.roomId) ?? null;
              }
            });
          }
        }

        setRooms(baseRooms);
      } catch (e) {
        console.error('Error fetching chat list:', e);
        Alert.alert('錯誤', '無法載入聊天列表');
        setRooms([]);
      } finally {
        if (!isPullToRefresh) setLoading(false);
        isFetchingRef.current = false;
        if (isPullToRefresh) setIsRefreshing(false);
      }
    },
    [user?.id]
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchRooms(true);
  }, [fetchRooms]);

  // ------------------------------
  // 2) Focus Effect (Load + Listener)
  // ------------------------------
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;

      // 初次載入
      if (!didInitialLoadRef.current) {
        didInitialLoadRef.current = true;
        fetchRooms(false);
      }

      let cancelled = false;

      const attach = async () => {
        const ok = await connectChatServer(user.id);
        if (!ok || cancelled) return;

        // ✅ 先確保不會重複掛 listener
        if (listenerRef.current) {
          removeChatListener(listenerRef.current);
          listenerRef.current = null;
        }

        const listener = (msg: any) => {
          if (!msg || typeof msg !== 'object' || msg.type !== 'MESSAGE') return;

          const { roomId, content, createdAt } = msg;

          setRooms((prev) => {
            const idx = prev.findIndex((r) => r.roomId === roomId);
            if (idx === -1) {
              // 如果收到新房間的訊息（列表中沒有），重新抓一次
              fetchRooms(true);
              return prev;
            }

            const updated = {
              ...prev[idx],
              lastMessage: content,
              lastMessageTime: createdAt,
            };

            const next = [...prev];
            next.splice(idx, 1);
            return [updated, ...next];
          });
        };

        listenerRef.current = listener;
        addChatListener(listener);
      };

      void attach();

      return () => {
        cancelled = true;
        if (listenerRef.current) {
          removeChatListener(listenerRef.current);
          listenerRef.current = null;
        }
      };
    }, [user?.id, fetchRooms])
  );

  // ------------------------------
  // 3) Group Create
  // ------------------------------
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('錯誤', '請輸入群組名稱');
      return;
    }
    if (!user?.id) {
      Alert.alert('錯誤', '用戶未登入');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_group_room', {
        p_creator_id: user.id,
        p_group_name: newGroupName.trim(),
      });

      if (error) throw error;

      const newRoomId = String(data);

      setShowCreateModal(false);
      setNewGroupName('');
      await fetchRooms(true);

      navigation.navigate('Chat', {
        roomId: newRoomId,
        targetUserName: newGroupName.trim(),
        isGroup: true,
      });
    } catch (e: any) {
      console.error('建立群組失敗:', e);
      Alert.alert('建立失敗', e.message || '無法建立群組，請檢查後端配置。');
    } finally {
      setIsCreating(false);
    }
  };

  // ------------------------------
  // UI Helpers
  // ------------------------------
  const handleGoBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Tabs');
  };

  const openRoom = (item: ChatRoomSummary) => {
    if (item.isGroup) {
      navigation.navigate('Chat', { roomId: item.roomId, isGroup: true, targetUserName: item.name });
      return;
    }
    if (!item.targetUserId) {
      Alert.alert('資料異常', '聊天室缺少目標用戶 ID');
      return;
    }

    navigation.navigate('Chat', {
      roomId: item.roomId,
      isGroup: false,
      targetUserId: item.targetUserId,
      targetUserName: item.name,
    });
  };

  const handleLongPressPreview = (item: ChatRoomSummary) => {
    setPreviewContent(item);
    setPreviewModalVisible(true);
  };

  const handleClosePreview = () => {
    setPreviewModalVisible(false);
    setTimeout(() => setPreviewContent(null), 100);
  };

  const handleMarkAsRead = (item: ChatRoomSummary) => {
    clearRoomUnread?.(item.roomId);
    Alert.alert('提示', `${item.name} 的訊息已設為已讀。`);
    handleClosePreview();
  };

  const handleDeleteChat = (item: ChatRoomSummary) => {
    Alert.alert('確認刪除', `您確定要刪除與 ${item.name} 的所有對話記錄嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          Alert.alert('提示', `${item.name} 的對話記錄已在前端模擬刪除。`);
          fetchRooms(true);
          handleClosePreview();
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ChatRoomSummary }) => {
    const unreadCount = unread.perRoom[item.roomId] || 0;
    const timeStr = formatListTime(item.lastMessageTime);

    const avatarUri =
      item.isGroup
        ? getGroupAvatarUri(item) // ✅ 群組用 DB avatar_url 或 fallback
        : item.avatarUrl || fallbackAvatar(item.targetUserId || 'unknown'); // ✅ 私聊：對方 avatar_url 或 fallback

    return (
      <TouchableOpacity
        style={styles.roomItem}
        onPress={() => openRoom(item)}
        onLongPress={() => handleLongPressPreview(item)}
        activeOpacity={0.75}
      >
        <View style={styles.avatarContainer}>
          {item.isGroup ? (
            // ✅ 群組：有 avatarUrl 就顯示 Image；沒有就顯示 people icon
            (item.avatarUrl && item.avatarUrl.trim().length > 0 && item.avatarUrl.trim() !== 'NULL') ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatar, styles.groupAvatar]}>
                <Ionicons name="people" size={24} color={COLORS.primary} />
              </View>
            )
          ) : (
            // ✅ 私聊：維持原本（對方 avatarUrl 或 dicebear fallback）
            <Image source={{ uri: avatarUri! }} style={styles.avatar} resizeMode="cover" />
          )}

          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.rowTop}>
            <Text style={styles.roomName} numberOfLines={1}>
              {item.name || '未命名'}
            </Text>
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>

          <Text style={styles.lastMsg} numberOfLines={1}>
            {displayLastMessage(item)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      <TopBar coins={coins} unreadCount={unread.total} />

      <View style={styles.customHeader}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={styles.backButtonTouchArea}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={COLORS.black} />
        </TouchableOpacity>

        <Text style={styles.pageTitle}>訊息列表</Text>

        <View style={styles.rightHeaderGroup}>
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.createBtn} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.spacerRight} />
        </View>
      </View>

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={rooms}
            keyExtractor={(item) => item.roomId}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 80 }}
            ListEmptyComponent={
              <View style={styles.emptyView}>
                <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>還沒有任何對話</Text>
              </View>
            }
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
          />
        )}
      </View>

      {/* 建立群組 Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>建立新群組</Text>
            <TextInput
              style={styles.input}
              placeholder="輸入群組名稱"
              value={newGroupName}
              onChangeText={setNewGroupName}
              editable={!isCreating}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={() => setShowCreateModal(false)}
                disabled={isCreating}
              >
                <Text style={styles.btnTextCancel}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnConfirm]}
                onPress={handleCreateGroup}
                disabled={isCreating || !newGroupName.trim()}
              >
                {isCreating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextConfirm}>建立</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 長按預覽 Modal */}
      <Modal visible={previewModalVisible} transparent animationType="fade" onRequestClose={handleClosePreview}>
        <TouchableOpacity style={styles.previewModalOverlay} onPress={handleClosePreview} activeOpacity={1}>
          {previewContent && (
            <TouchableOpacity activeOpacity={1} style={styles.previewModalContent} onPress={() => {}}>
              <View style={styles.previewInfo}>
                <Text style={styles.previewRoomName}>{previewContent.name}</Text>
                <Text style={styles.previewTime}>{formatListTime(previewContent.lastMessageTime)}</Text>
              </View>

              <View style={styles.separator} />
              <Text style={styles.previewLastMsg} numberOfLines={3}>
                {displayLastMessage(previewContent)}
              </Text>

              <View style={styles.previewActions}>
                {(unread.perRoom[previewContent.roomId] || 0) > 0 && (
                  <TouchableOpacity style={styles.actionButtonSmall} onPress={() => handleMarkAsRead(previewContent)}>
                    <Ionicons name="checkmark-done" size={20} color={COLORS.primary} />
                    <Text style={styles.actionTextSmall}>設為已讀</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.actionButtonSmall} onPress={() => handleDeleteChat(previewContent)}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  <Text style={styles.actionTextSmallDanger}>刪除</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.separator} />

              <TouchableOpacity
                style={styles.previewGoToChatBtn}
                onPress={() => {
                  handleClosePreview();
                  openRoom(previewContent);
                }}
              >
                <Text style={styles.previewGoToChatText}>進入聊天室</Text>
                {(unread.perRoom[previewContent.roomId] || 0) > 0 && (
                  <View style={styles.previewUnreadBadge}>
                    <Text style={styles.unreadText}>
                      {(unread.perRoom[previewContent.roomId] || 0) > 99 ? '99+' : unread.perRoom[previewContent.roomId]}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
};

// ------------------------------
// Styles (你的原本樣式保留)
// ------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  customHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFF',
    position: 'relative',
  },

  pageTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
    textAlign: 'center',
    textAlignVertical: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 25,
    bottom: 0,
    alignSelf: 'center',
  },

  backButtonTouchArea: {
    width: 60,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    zIndex: 10,
  },

  rightHeaderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
    justifyContent: 'flex-end',
    zIndex: 10,
  },

  createBtn: {
    backgroundColor: COLORS.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  spacerRight: { width: 10, height: 1 },

  roomItem: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    alignItems: 'center',
  },

  avatarContainer: { position: 'relative', marginRight: 12 },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F3F4F6',
  },

  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    paddingHorizontal: 4,
  },

  unreadText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  contentContainer: { flex: 1, justifyContent: 'center' },

  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },

  roomName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#1F2937',
    maxWidth: '70%',
  },

  timeText: { fontSize: 12, color: '#9CA3AF' },

  lastMsg: { fontSize: 14, color: '#6B7280' },

  emptyView: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: 10, color: '#9CA3AF' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalContent: {
    width: '80%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    elevation: 5,
  },

  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },

  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 24,
  },

  modalBtns: { flexDirection: 'row', justifyContent: 'space-between' },

  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },

  btnCancel: { backgroundColor: '#F3F4F6', marginRight: 8 },
  btnConfirm: { backgroundColor: COLORS.primary, marginLeft: 8 },

  btnTextCancel: { color: '#4B5563', fontWeight: '600' },
  btnTextConfirm: { color: '#FFF', fontWeight: '600' },

  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.01)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 50,
  },
  previewModalContent: {
    width: '85%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: SPACING.lg,
    maxHeight: 300,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  previewInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewRoomName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
    marginBottom: 4,
  },
  previewTime: { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  separator: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 10 },
  previewLastMsg: { fontSize: 15, color: '#374151', marginBottom: 16 },

  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionButtonSmall: { alignItems: 'center', paddingHorizontal: 10 },
  actionTextSmall: { fontSize: 12, color: COLORS.primary, marginTop: 4, fontWeight: '500' },
  actionTextSmallDanger: { fontSize: 12, color: '#EF4444', marginTop: 4, fontWeight: '500' },

  previewGoToChatBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 10,
  },
  previewGoToChatText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.md },
  previewUnreadBadge: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#EF4444',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  groupAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0E7FF',
  },
});