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
  // ★ 引入 RefreshControl
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
  const { user } = useAuth();
  const { unread, clearRoomUnread } = useUnread();
  const { coins } = useCoinsContext();

  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // ★ 新增：下拉刷新狀態
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 群組創建相關 State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // ★ 預覽 Modal 狀態 (保留以防未來使用)
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewContent, setPreviewContent] = useState<ChatRoomSummary | null>(null);


  // 輔助 Ref
  const didInitialLoadRef = useRef(false);
  const isFetchingRef = useRef(false);

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
  
  // ★ 修正 isImageUrl: 使用更精確的 Supabase URL 判斷
  const isImageUrl = (content?: string | null) => {
      if (!content) return false;
      const supabaseUrl = 'https://jbcfmrpycmoffahbhfnr.supabase.co/storage/v1/object/public/chat-images/';
      return content.startsWith(supabaseUrl) || (content.includes('http') && (content.includes('.jpg') || content.includes('.png')));
  };

  // 處理最後一條訊息的顯示內容
  const displayLastMessage = (item: ChatRoomSummary) => {
      if (!item.lastMessage) {
          return '尚無訊息';
      }

      if (isImageUrl(item.lastMessage)) {
          if (item.isGroup) {
              return '[相片]';
          } else {
              return `${item.name || '用戶'} 傳送了相片`;
          }
      }
      
      return item.lastMessage.trim();
  };

  // ------------------------------
  // 1) Fetch Rooms (Real Data)
  // ------------------------------
  // 讓此函數可以被下拉更新調用
  const fetchRooms = useCallback(async (isPullToRefresh = false) => {
    if (!user?.id) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    
    // 只有初始載入時顯示 Loading Spinner，下拉更新使用 RefreshControl
    if (!isPullToRefresh) {
        setLoading(true);
    }

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
      // 結束下拉刷新狀態
      if (isPullToRefresh) {
          setIsRefreshing(false);
      }
    }
  }, [user?.id]);

  // ★ 新增：處理下拉更新的函數
  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchRooms(true); // 傳入 true 標記為下拉更新
  }, [fetchRooms]);


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
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
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
  
  // ★ 長按預覽邏輯 (保留以防未來使用)
  const handleLongPressPreview = (item: ChatRoomSummary) => {
      setPreviewContent(item);
      setPreviewModalVisible(true);
  };

  const handleClosePreview = () => {
      setPreviewModalVisible(false);
      setTimeout(() => setPreviewContent(null), 100); 
  };
  
  const handleMarkAsRead = (item: ChatRoomSummary) => {
    // 假設您在 ChatListScreen 內部沒有 clearRoomUnread，因此從 context 傳入
    // 在您的 useFocusEffect 中，clearRoomUnread 是從 useUnread 導入的
    if (clearRoomUnread) {
        clearRoomUnread(item.roomId);
    }
    Alert.alert('提示', `${item.name} 的訊息已設為已讀。`);
    handleClosePreview();
  };

  const handleDeleteChat = (item: ChatRoomSummary) => {
    Alert.alert(
        '確認刪除',
        `您確定要刪除與 ${item.name} 的所有對話記錄嗎？`,
        [
            { text: '取消', style: 'cancel' },
            { 
                text: '刪除', 
                style: 'destructive', 
                onPress: async () => {
                    // TODO: 在這裡實現 Supabase 刪除對話記錄的邏輯
                    Alert.alert('提示', `${item.name} 的對話記錄已在前端模擬刪除。`);
                    fetchRooms();
                    handleClosePreview();
                } 
            },
        ]
    );
  };


  const renderItem = ({ item }: { item: ChatRoomSummary }) => {
    const unreadCount = unread.perRoom[item.roomId] || 0;
    const timeStr = formatListTime(item.lastMessageTime);

    const avatarUri =
      item.isGroup
        ? null
        : (item.avatarUrl || fallbackAvatar(item.targetUserId || 'unknown'));

    return (
      <TouchableOpacity 
        style={styles.roomItem} 
        onPress={() => openRoom(item)} 
        onLongPress={() => handleLongPressPreview(item)} 
        activeOpacity={0.75}
      >
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

          {/* 顯示最後一條訊息內容 */}
          <Text style={styles.lastMsg} numberOfLines={1}>
            {displayLastMessage(item)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      {/* 這裡不再傳入 onSettingsPress，使用 TopBar 的預設導航 */}
      <TopBar coins={coins} unreadCount={unread.total} /> 

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

        {/* 2. 中間標題 (使用絕對定位強制居中) */}
        <Text style={styles.pageTitle}>訊息列表</Text>

        {/* 3. 右側元素群組 (用於對齊) */}
        <View style={styles.rightHeaderGroup}> 
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.createBtn} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color="#FFF" />
          </TouchableOpacity>
          {/* 3b. 佔位符 */}
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
            // ★ 實作下拉更新
            refreshControl={
                <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={onRefresh}
                    tintColor={COLORS.primary}
                />
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
      
      {/* ★★★ 長按預覽 Modal (懸浮卡片效果) ★★★ */}
      <Modal 
          visible={previewModalVisible} 
          transparent 
          animationType="fade"
          onRequestClose={handleClosePreview}
      >
          {/* 整個屏幕作為遮罩，點擊時關閉 Modal */}
          <TouchableOpacity 
              style={styles.previewModalOverlay} 
              onPress={handleClosePreview} 
              activeOpacity={1}
          >
              {previewContent && (
                  // 預覽內容 - 阻止點擊內部時關閉 Modal
                  <TouchableOpacity 
                      activeOpacity={1} 
                      style={styles.previewModalContent}
                      onPress={() => { /* 點擊內容不做任何事 */ }} 
                  >
                      {/* --- 1. 頂部資訊 --- */}
                      <View style={styles.previewInfo}>
                          <Text style={styles.previewRoomName}>{previewContent.name}</Text>
                          <Text style={styles.previewTime}>
                              {formatListTime(previewContent.lastMessageTime)}
                          </Text>
                      </View>

                      {/* --- 2. 訊息內容 --- */}
                      <View style={styles.separator} />
                      <Text style={styles.previewLastMsg} numberOfLines={3}> 
                          {displayLastMessage(previewContent)}
                      </Text>

                      {/* --- 3. 操作選單 (新增) --- */}
                      <View style={styles.previewActions}>
                          {/* 設為已讀按鈕 (僅在有未讀時顯示) */}
                          {unread.perRoom[previewContent.roomId] > 0 && (
                              <TouchableOpacity 
                                  style={styles.actionButtonSmall}
                                  onPress={() => handleMarkAsRead(previewContent)}
                              >
                                  <Ionicons name="checkmark-done" size={20} color={COLORS.primary} />
                                  <Text style={styles.actionTextSmall}>設為已讀</Text>
                              </TouchableOpacity>
                          )}

                          {/* 刪除按鈕 */}
                          <TouchableOpacity 
                              style={styles.actionButtonSmall}
                              onPress={() => handleDeleteChat(previewContent)}
                          >
                              <Ionicons name="trash-outline" size={20} color="#EF4444" />
                              <Text style={styles.actionTextSmallDanger}>刪除</Text>
                          </TouchableOpacity>
                      </View>
                      
                      <View style={styles.separator} />

                      {/* --- 4. 底部進入聊天室按鈕 --- */}
                      <TouchableOpacity 
                          style={styles.previewGoToChatBtn}
                          onPress={() => {
                              handleClosePreview();
                              openRoom(previewContent);
                          }}
                      >
                          <Text style={styles.previewGoToChatText}>進入聊天室</Text>
                          {/* 顯示未讀數徽章 (如果還有未讀) */}
                          {unread.perRoom[previewContent.roomId] > 0 && (
                              <View style={styles.previewUnreadBadge}>
                                  <Text style={styles.unreadText}>
                                      {unread.perRoom[previewContent.roomId] > 99 ? '99+' : unread.perRoom[previewContent.roomId]}
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
    position: 'relative', 
  },

  // ★ 修正點：調整字體大小為 FONT_SIZES.lg
  pageTitle: {
    fontSize: 25, 
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
    textAlign: 'center',
    textAlignVertical: 'center', // 確保 Android 上的垂直居中
    
    // 絕對定位實現居中
    position: 'absolute',
    left: 0,
    right: 0,
    top: 25, // 設為 0
    bottom: 0, // 設為 0
    alignSelf: 'center', // 確保組件容器居中
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
    zIndex: 10, // 確保按鈕在標題上方
  },
  
  // 右側容器：總寬度與左側對齊
  rightHeaderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60, 
    justifyContent: 'flex-end',
    zIndex: 10, // 確保按鈕在標題上方
  },

  createBtn: {
    backgroundColor: COLORS.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

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

  // --- 建立群組 Modal 樣式 ---
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

  // --- 預覽 Modal 樣式 (懸浮卡片) ---
  previewModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.01)', // 幾乎透明的遮罩
      justifyContent: 'flex-end',          // 內容靠底部對齊
      alignItems: 'center',
      paddingBottom: 50,                   // 距離底部留出空間
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
  previewInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
  },
  previewRoomName: {
      fontSize: FONT_SIZES.xl,
      fontWeight: FONT_WEIGHTS.bold,
      color: COLORS.black,
      marginBottom: 4,
  },
  previewTime: {
      fontSize: 12,
      color: '#9CA3AF',
      marginBottom: 8,
  },
  separator: {
      height: 1,
      backgroundColor: '#F3F4F6',
      marginVertical: 10,
  },
  previewLastMsg: {
      fontSize: 15,
      color: '#374151',
      marginBottom: 16,
  },
  // 新增：操作選單容器
  previewActions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: 8,
  },
  actionButtonSmall: {
      alignItems: 'center',
      paddingHorizontal: 10,
  },
  actionTextSmall: {
      fontSize: 12,
      color: COLORS.primary,
      marginTop: 4,
      fontWeight: '500',
  },
  actionTextSmallDanger: {
      fontSize: 12,
      color: '#EF4444',
      marginTop: 4,
      fontWeight: '500',
  },
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
  previewGoToChatText: {
      color: '#FFF',
      fontWeight: FONT_WEIGHTS.bold,
      fontSize: FONT_SIZES.md,
  },
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
});