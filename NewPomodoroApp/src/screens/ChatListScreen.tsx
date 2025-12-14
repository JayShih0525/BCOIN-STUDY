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
} from 'react-native';
// 移除 StackActions，改為使用 navigation.navigate('Tabs') 更穩定
import { useNavigation, useFocusEffect } from '@react-navigation/native'; 
import Ionicons from 'react-native-vector-icons/Ionicons';

import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useUnread } from '../context/UnreadContext';
import { useCoinsContext } from '../context/CoinsContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';

// TCP chat client
import {
  connectChatServer,
  addChatListener,
  removeChatListener,
} from '../utils/chatClient';

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
  avatarUrl?: string | null;
}

// 與 Supabase RPC 'get_user_chat_list' 的回傳欄位對應
interface SupabaseChatRoomSummary {
  room_id: string;
  name: string;
  is_group: boolean;
  target_user_id?: string | null;
  last_message?: string | null;
  last_message_time?: string | null;
}

// ------------------------------
// Component
// ------------------------------
export const ChatListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const { unread } = useUnread();
  const { coins } = useCoinsContext();

  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // 群組創建相關 State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // 輔助 Ref
  const didInitialLoadRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isImageUrl = (content: string) => content.includes('https://jbcfmrpycmoffahbhfnr.supabase.co/storage/v1/object/public/chat-images/');

  // ------------------------------
  // Helpers
  // ------------------------------
  const formatListTime = (iso?: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
  };

  const fallbackAvatar = useCallback((seed: string) => {
    const encodedSeed = encodeURIComponent(seed || 'default');
    return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${encodedSeed}&backgroundColor=transparent`;
  }, []);

  // ------------------------------
  // 1) Fetch Rooms (Real Data)
  // ------------------------------
  const fetchRooms = useCallback(async () => {
    if (!user?.id) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('get_user_chat_list', {
        p_user_id: user.id,
      });

      if (error) {
        console.error('[get_user_chat_list] RPC Error:', error);
        throw error;
      }

      const realRooms = (data ?? []) as SupabaseChatRoomSummary[];

      // 1. 轉換並初始化 baseRooms
      const baseRooms: ChatRoomSummary[] = realRooms.map((row) => ({
        roomId: row.room_id,
        name: row.name,
        isGroup: !!row.is_group,
        targetUserId: row.target_user_id ?? null,
        lastMessage: row.last_message ?? null,
        lastMessageTime: row.last_message_time ?? null,
        avatarUrl: null,
      }));

      // 2. 批量查 user_profiles 的 avatar_url
      const targetIds = baseRooms
        .filter((r) => !r.isGroup && r.targetUserId)
        .map((r) => r.targetUserId!) as string[];

      if (targetIds.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('user_profiles')
          .select('user_id, avatar_url')
          .in('user_id', targetIds);

        if (!pErr && profiles) {
          const map = new Map<string, string | null>();
          profiles.forEach((p: any) => map.set(p.user_id, p.avatar_url));

          baseRooms.forEach((r) => {
            if (!r.isGroup && r.targetUserId) {
              r.avatarUrl = map.get(r.targetUserId) ?? null;
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
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user?.id]);

  // ------------------------------
  // 2) Focus Effect (Load + Listener)
  // ------------------------------
  useFocusEffect(
    useCallback(() => {
      // 首次載入
      if (!didInitialLoadRef.current) {
        didInitialLoadRef.current = true;
        fetchRooms();
      }

      // 設置 TCP 訊息監聽器 (用於即時更新列表順序)
      if (!user?.id) return;

      let cancelled = false;

      (async () => {
        const ok = await connectChatServer(user.id);
        if (!ok || cancelled) return;

        const listener = (msg: any) => {
          if (!msg || typeof msg !== 'object' || msg.type !== 'MESSAGE') return;

          const { roomId, content, createdAt } = msg;

          setRooms((prev) => {
            const idx = prev.findIndex((r) => r.roomId === roomId);
            
            if (idx === -1) {
              fetchRooms();
              return prev;
            }

            const updated = { ...prev[idx], lastMessage: content, lastMessageTime: createdAt };
            const next = [...prev];
            next.splice(idx, 1);
            return [updated, ...next];
          });
        };

        addChatListener(listener);
        return () => {
          removeChatListener(listener);
        };
      })();

      return () => {
        cancelled = true;
      };
    }, [user?.id, fetchRooms])
  );

  // ------------------------------
  // 3) Group Create (Mock to UI)
  // ------------------------------
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('錯誤', '請輸入群組名稱');
      return;
    }
    setIsCreating(true);
    try {
      await new Promise(r => setTimeout(() => r(true), 1000)); 
      
      const newRoomId = `group_${Date.now()}`;

      const newRoom: ChatRoomSummary = {
        roomId: newRoomId,
        name: newGroupName,
        isGroup: true,
        lastMessage: '群組已建立',
        lastMessageTime: new Date().toISOString(),
        targetUserId: null,
        avatarUrl: null,
      };

      setRooms((prev) => [newRoom, ...prev]);
      setShowCreateModal(false);
      setNewGroupName('');

      navigation.navigate('Chat', {
        roomId: newRoomId,
        targetUserName: newGroupName,
        isGroup: true,
      });
    } catch (e) {
      Alert.alert('建立失敗', '無法建立群組');
    } finally {
      setIsCreating(false);
    }
  };

  // ------------------------------
  // 4) UI Helpers
  // ------------------------------
  const handleGoBack = () => {
    // 穩定回退策略：確保可以返回，否則導航到 Tabs
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // 假設 Tabs 是 Stack Navigator 的根節點
      navigation.navigate('Tabs'); 
    }
  };

  const openRoom = (item: ChatRoomSummary) => {
    if (!item.isGroup && !item.targetUserId) {
      Alert.alert('資料異常', '聊天室缺少目標用戶 ID');
      return;
    }

    navigation.navigate('Chat', {
      roomId: item.roomId,
      targetUserId: item.targetUserId || user!.id,
      targetUserName: item.name,
      isGroup: item.isGroup,
    });
  };

  const renderItem = ({ item }: { item: ChatRoomSummary }) => {
    const unreadCount = unread.perRoom[item.roomId] || 0;
    const timeStr = formatListTime(item.lastMessageTime);

    const avatarUri =
      item.isGroup
        ? null
        : (item.avatarUrl || fallbackAvatar(item.targetUserId || 'unknown'));

    // ★ 修正點 1: 處理最後一條訊息的顯示內容
    const displayLastMessage = () => {
        if (!item.lastMessage) {
            return '尚無訊息';
        }

        if (isImageUrl(item.lastMessage)) {
            // 由於在 ChatList 頁面中，我們無法輕易確定發送者是誰，
            // 對於 1v1 聊天，我們使用對方的名字；對於群組，我們只顯示 [相片]。
            if (item.isGroup) {
                return '[相片]';
            } else {
                return `${item.name || '用戶'} 傳送了相片`;
            }
        }
        
        return item.lastMessage.trim();
    };

    return (
      <TouchableOpacity style={styles.roomItem} onPress={() => openRoom(item)} activeOpacity={0.75}>
        {/* 頭像區域 */}
        <View style={styles.avatarContainer}>
          {item.isGroup ? (
            <View style={[styles.avatar, styles.groupAvatar]}>
              <Ionicons name="people" size={24} color={COLORS.primary} />
            </View>
          ) : (
            <Image source={{ uri: avatarUri! }} style={styles.avatar} />
          )}

          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              {/* 修正點：確保所有文本在 <Text> 內 */}
              <Text style={styles.unreadText}>{(unreadCount > 99 ? '99+' : unreadCount)}</Text>
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

          {/* ★ 修正點 2: 使用新的 displayLastMessage 函數 */}
          <Text style={styles.lastMsg} numberOfLines={1}>
            {displayLastMessage()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      <TopBar coins={coins} onSettingsPress={signOut} unreadCount={unread.total} />

      <View style={styles.customHeader}>
        {/* 1. 左側按鈕 */}
        <TouchableOpacity 
          onPress={handleGoBack} 
          style={styles.backButtonTouchArea} 
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={COLORS.black} />
        </TouchableOpacity>

        {/* 2. 中間標題 */}
        <Text style={styles.pageTitle}>訊息列表</Text>

        {/* 3. 右側元素群組 (用於對齊) */}
        <View style={styles.rightHeaderGroup}> 
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.createBtn} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color="#FFF" />
          </TouchableOpacity>
          {/* 3b. 佔位符 (調整 width 來移動按鈕) */}
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
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.btnTextCancel}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnConfirm]} onPress={handleCreateGroup} disabled={isCreating}>
                {isCreating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextConfirm}>建立</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

// ------------------------------
// Styles
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
  },

  pageTitle: {
    flex: 1,
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
    textAlign: 'center',
  },

  // 左側按鈕區域：寬度 60
  backButtonTouchArea: {
    width: 60, 
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
  },
  
  // 右側容器：總寬度與左側對齊
  rightHeaderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60, // 保持與左側 backButtonTouchArea 寬度一致
    justifyContent: 'flex-end',
  },

  createBtn: {
    backgroundColor: COLORS.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    // 移除任何 margin，讓 spacerRight 決定位置
  },

  // 佔位符：用於將 createBtn 往右推。
  // 36 (按鈕) + 24 (Spacer) = 60 (總寬度)
  // 若要將按鈕往右推，可以減少 Spacer 寬度，並將 createBtn 加上 margin
  spacerRight: {
    width: 10, 
    height: 1, 
  },
  
  // 列表項目樣式
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

  groupAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0E7FF',
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

  // Modal 樣式
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
});