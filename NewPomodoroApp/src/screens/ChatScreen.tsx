// ChatScreen.tsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Clipboard + permissions + download
import Clipboard from '@react-native-clipboard/clipboard';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import RNFS from 'react-native-fs';

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
import { supabase } from '../lib/supabase';
import { getAvatarUrl } from '../utils/avatar';
import { decode } from 'base-64';

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  Chat: {
    roomId?: string;
    targetUserId?: string;
    targetUserName: string;
    isGroup?: boolean;
  };
  AddGroupMemberScreen: {
    roomId: string;
    onSelectUsers: (selectedIds: string[]) => void;
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

// -----------------------
// Permissions + Save Image
// -----------------------
const getSavePermission = async (): Promise<boolean> => {
  const permission = Platform.select({
    ios: PERMISSIONS.IOS.PHOTO_LIBRARY_ADD_ONLY,
    android:
      Platform.Version >= '33'
        ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
        : PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
    default: undefined,
  });

  if (!permission) return false;

  let result = await check(permission);
  if (result !== RESULTS.GRANTED) {
    result = await request(permission);
  }
  return result === RESULTS.GRANTED;
};

const saveImageToGallery = async (url: string) => {
  try {
    const hasPermission = await getSavePermission();
    if (!hasPermission) {
      Alert.alert('權限不足', '請授予應用程式儲存照片到相簿的權限。');
      return;
    }

    const cleanUrl = url.split('?')[0];
    let filename = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
    if (!filename.includes('.')) filename = `${filename}.jpg`;
    const localPath = `${RNFS.CachesDirectoryPath}/${filename}`;

    const res = await RNFS.downloadFile({ fromUrl: url, toFile: localPath }).promise;
    if (res.statusCode !== 200) {
      throw new Error(`Download failed with status code ${res.statusCode}`);
    }

    const fileUri = Platform.OS === 'ios' ? `file://${localPath}` : localPath;
    await CameraRoll.save(fileUri, { type: 'photo' });

    Alert.alert('下載成功', '圖片已保存到您的相簿。');
    await RNFS.unlink(localPath);
  } catch (e: any) {
    console.error('Image save error:', e);
    Alert.alert('下載失敗', e?.message || '無法保存圖片，請檢查權限或重試。');
  }
};

// -----------------------
// Date helpers
// -----------------------
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

  const { user } = useAuth();
  const { coins, refresh } = useCoinsContext();
  const { setActiveRoomId, clearRoomUnread, unread } = useUnread();

  // -----------------------
  // State
  // -----------------------
  const [roomId, setRoomId] = useState<string>(routeRoomId || '');
  const [roomReady, setRoomReady] = useState<boolean>(!!routeRoomId || isGroup);
  const [targetAvatarUrl, setTargetAvatarUrl] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(targetUserName);

  // group members
  const [roomMembers, setRoomMembers] = useState<Map<string, { displayName: string; avatarUrl: string }>>(
    new Map()
  );
  const [userRole, setUserRole] = useState<'member' | 'admin' | 'owner' | null>(null);

  // messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // input
  const [inputText, setInputText] = useState('');

  // scroll
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadNewMsgCount, setUnreadNewMsgCount] = useState(0);

  // status
  const [isTargetOnline, setIsTargetOnline] = useState(false);

  // uploading (chat images)
  const [isUploading, setIsUploading] = useState(false);

  // transfer
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // image preview modal
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState('');
  const [isImageLoading, setIsImageLoading] = useState(true);

  // ✅ Group name + group avatar (chat_rooms.name / chat_rooms.avatar_url)
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);

  // -----------------------
  // Refs
  // -----------------------
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const historyFetchedRef = useRef(false);
  const currentRoomIdRef = useRef<string>('');
  const pan = useRef(new Animated.ValueXY()).current;

  // -----------------------
  // ✅ ChatListScreen 同款 fallback avatar
  // -----------------------
  const fallbackAvatar = useCallback((seed: string) => {
    const encodedSeed = encodeURIComponent(seed || 'default');
    return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${encodedSeed}&backgroundColor=transparent`;
  }, []);

  // ✅ 群組 header 要顯示的頭貼：有圖用圖，沒圖用 fallback（Image）
  const groupHeaderAvatarUri = useMemo(() => {
    if (!isGroup) return null;

    const v = (groupAvatarUrl ?? '').trim();
    const valid = v.length > 0 && v !== 'NULL';
    return valid ? v : null; // ✅ 沒圖就回 null，改用 people icon
  }, [isGroup, groupAvatarUrl]);

  // -----------------------
  // Memo / callback
  // -----------------------
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleCloseImageModal = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    setImageModalVisible(false);
  }, [pan]);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        const touches = evt.nativeEvent.touches?.length ?? 0;
        return touches === 1;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches?.length ?? 0;
        if (touches >= 2) return false;
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 5;
      },
      onPanResponderMove: Animated.event([null, { dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, gestureState) => {
        const isClosing = gestureState.dy > 100 || gestureState.vy > 0.5;
        if (isClosing) {
          Animated.timing(pan, {
            toValue: { x: 0, y: height },
            duration: 200,
            useNativeDriver: true,
          }).start(() => setImageModalVisible(false));
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            bounciness: 5,
          }).start();
        }
      },
    });
  }, [pan]);

  const canManageGroup = useMemo(() => {
    if (!isGroup || !userRole) return false;
    return userRole === 'owner' || userRole === 'admin';
  }, [isGroup, userRole]);

  // -----------------------
  // Fetch group members (roles + profiles)
  // -----------------------
  const fetchMembers = useCallback(async () => {
    if (!roomId || !isGroup || !user?.id) return;

    try {
      const { data: memberRows, error: memberRowsError } = await supabase
        .from('chat_room_members')
        .select('user_id, role')
        .eq('room_id', roomId);

      if (memberRowsError) throw memberRowsError;
      if (!memberRows || memberRows.length === 0) return;

      const roleMap = new Map<string, string>();
      memberRows.forEach((r: any) => roleMap.set(r.user_id, r.role));

      const currentUserRole = (roleMap.get(user.id) || 'member') as 'member' | 'admin' | 'owner';
      setUserRole(currentUserRole);

      const memberIds = memberRows.map((r: any) => r.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', memberIds);

      if (profileError || !profiles) throw profileError;

      const newMembersMap = new Map<string, { displayName: string; avatarUrl: string }>();
      profiles.forEach((p: any) => {
        const fallback = getAvatarUrl(p.user_id);
        newMembersMap.set(p.user_id, {
          displayName: p.display_name || `User ${p.user_id.substring(0, 4)}`,
          avatarUrl: p.avatar_url || fallback,
        });
      });
      setRoomMembers(newMembersMap);
    } catch (e) {
      console.error('[ChatScreen] Fetch group members error:', e);
    }
  }, [roomId, isGroup, user?.id]);

  // -----------------------
  // Effects
  // -----------------------
  useEffect(() => {
    let cancelled = false;

    const setupRoom = async () => {
      if (!user?.id) return;

      // Direct chat: fetch target profile
      if (!isGroup && targetUserId) {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('avatar_url, display_name')
            .eq('user_id', targetUserId)
            .maybeSingle();

          if (!error && data) {
            if (data.avatar_url) setTargetAvatarUrl(data.avatar_url);
            else setTargetAvatarUrl(getAvatarUrl(targetUserId));

            if (data.display_name) setDisplayName(data.display_name);
          } else {
            setTargetAvatarUrl(getAvatarUrl(targetUserId));
          }
        } catch {
          setTargetAvatarUrl(getAvatarUrl(targetUserId));
        }
      }

      // Group or already have roomId
      if (isGroup || routeRoomId) {
        if (routeRoomId) setRoomId(routeRoomId);
        setRoomReady(true);
        if (isGroup && routeRoomId) await fetchMembers();
        return;
      }

      // Ensure 1v1 room
      if (targetUserId) {
        try {
          const { data, error } = await supabase.rpc('ensure_one_to_one_room', {
            p_user1_id: user.id,
            p_user2_id: targetUserId,
          });

          if (error) throw error;
          const ensuredRoomId = String(data);

          if (!cancelled) {
            setRoomId(ensuredRoomId);
            setRoomReady(true);
          }
        } catch (e) {
          console.error('[ChatScreen] ensure_one_to_one_room error', e);
        }
      }
    };

    void setupRoom();

    return () => {
      cancelled = true;
    };
  }, [user?.id, targetUserId, isGroup, routeRoomId, fetchMembers]);

  // ✅ Load group name + avatar_url from chat_rooms
  useEffect(() => {
    if (!isGroup || !roomReady || !roomId) return;

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.from('chat_rooms').select('name, avatar_url').eq('id', roomId).maybeSingle();
        if (error) throw error;
        if (cancelled) return;

        const nameFromDb = data?.name?.trim();
        const avatarFromDb = data?.avatar_url?.trim();

        if (nameFromDb) setDisplayName(nameFromDb);
        else setDisplayName(targetUserName);

        if (avatarFromDb && avatarFromDb !== 'NULL') setGroupAvatarUrl(avatarFromDb);
        else setGroupAvatarUrl(null);
      } catch (e) {
        console.error('[ChatScreen] fetch group info error:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isGroup, roomReady, roomId, targetUserName]);

  // unread context
  useEffect(() => {
    if (!roomReady || !roomId) return;
    setActiveRoomId(roomId);
    clearRoomUnread(roomId);

    return () => {
      setActiveRoomId(null);
    };
  }, [roomReady, roomId, setActiveRoomId, clearRoomUnread]);

  // reset when room changes
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
      setUserRole(null);
    }
  }, [roomReady, roomId]);

  // listener + history
  useEffect(() => {
    if (!user || !roomReady || !roomId) return;

    let removed = false;

    connectChatServer(user.id).then((connected) => {
      if (!connected || removed) return;

      if (!historyFetchedRef.current) {
        getChatHistory(roomId, user.id);
        if (!isGroup && targetUserId) checkUserOnline(targetUserId);
        historyFetchedRef.current = true;
      }
    });

    const detectType = (content: string): 'IMAGE' | 'TRANSFER' | 'TEXT' => {
      if (content.includes('chat-images')) return 'IMAGE';
      if (content.includes('💸 Sent') && content.includes('coins')) return 'TRANSFER';
      return 'TEXT';
    };

    const updateRoomMemberIfMissing = (senderId: string, displayNameFromMsg?: string) => {
      if (!isGroup || !displayNameFromMsg) return;

      setRoomMembers((prev) => {
        if (prev.has(senderId)) return prev;

        const newMap = new Map(prev);
        newMap.set(senderId, {
          displayName: displayNameFromMsg,
          avatarUrl: getAvatarUrl(senderId),
        });
        return newMap;
      });
    };

    const listener = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      // HISTORY
      if (msg.type === 'HISTORY' && msg.roomId === roomId) {
        const rawList = msg.data || [];

        if (isGroup) {
          setRoomMembers((prev) => {
            const nextMap = new Map(prev);
            rawList.forEach((row: any) => {
              const senderId = row.senderId;
              const name = row.senderDisplayName || `User ${senderId.substring(0, 4)}`;

              if (!nextMap.has(senderId)) {
                nextMap.set(senderId, { displayName: name, avatarUrl: getAvatarUrl(senderId) });
              }
            });
            return nextMap;
          });
        }

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
              lastReadMessageId: mapped[0].id,
            });
          }
        }
      }

      // MESSAGE
      if (msg.type === 'MESSAGE' && msg.roomId === roomId) {
        const fromMe = msg.senderId === user.id;
        const msgType = detectType(msg.content);

        if (isGroup && !fromMe && msg.senderDisplayName) {
          updateRoomMemberIfMissing(msg.senderId, msg.senderDisplayName);
        }

        setMessages((prev) => {
          let pendingIndex = -1;

          if (msg.tempId) pendingIndex = prev.findIndex((m) => m.id === msg.tempId);
          if (pendingIndex === -1 && fromMe) pendingIndex = prev.findIndex((m) => m.isPending && m.content === msg.content);

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

      // online status
      if (msg.type === 'USER_STATUS' && msg.userId === targetUserId) setIsTargetOnline(msg.isOnline);
      if (msg.type === 'USER_STATUS_CHANGE' && msg.userId === targetUserId) setIsTargetOnline(msg.isOnline);
    };

    addChatListener(listener);
    return () => {
      removed = true;
      removeChatListener(listener);
    };
  }, [user?.id, roomReady, roomId, targetUserId, isGroup]);

  // -----------------------
  // Actions
  // -----------------------
  const handleImagePress = (url: string) => {
    setCurrentImageUrl(url);
    pan.setValue({ x: 0, y: 0 });
    setIsImageLoading(true);
    setImageModalVisible(true);
  };

  const handleImageLongPress = (url: string) => {
    Alert.alert('下載圖片', '您確定要將此圖片保存到相簿嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '下載', onPress: () => saveImageToGallery(url) },
    ]);
  };

  // pick chat image (send inside chat)
  const handlePickImage = async () => {
    if (!user || !roomId) return;

    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
      includeBase64: true,
    });

    if (!result.assets?.[0]) return;
    const asset = result.assets[0];

    if (!asset.base64) {
      Alert.alert('失敗', '拿不到圖片 base64，請換一張或檢查權限。');
      return;
    }

    const mimeType = asset.type || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';

    setIsUploading(true);
    try {
      const binary = decode(asset.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const filePath = `chat-images/${user.id}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from('chat-images').upload(filePath, bytes.buffer, {
        contentType: mimeType,
        upsert: false,
      });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      const publicUrl = data?.publicUrl;

      if (!publicUrl) throw new Error('拿不到 public url');

      handleSend(publicUrl, 'IMAGE');
    } catch (e: any) {
      console.error('Upload failed', e);
      Alert.alert('上傳失敗', e?.message ?? '無法上傳圖片，請稍後再試。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTransfer = async () => {
    if (!user || !roomId || isGroup || !targetUserId) return;

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
      handleSend(msg, 'TRANSFER', true);

      if (refresh) refresh();
      setShowTransferModal(false);
      setTransferAmount('');
      Alert.alert('轉帳成功', `已發送 ${val} 金幣給 ${displayName}`);
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

  // -----------------------
  // ✅ Group Name + Group Image
  // -----------------------
  const handleChangeGroupName = () => {
    if (!canManageGroup) return Alert.alert('權限不足', '只有管理員或擁有者可以修改群組名稱。');
    setGroupNameDraft(displayName || '');
    setShowGroupNameModal(true);
  };

  const saveGroupName = async () => {
    if (!user || !roomId) return;

    const nextName = groupNameDraft.trim();
    if (!nextName) return Alert.alert('名稱無效', '群組名稱不能為空。');
    if (nextName.length > 30) return Alert.alert('名稱太長', '群組名稱最多 30 個字。');

    setIsUpdatingGroup(true);
    try {
      const { error } = await supabase.from('chat_rooms').update({ name: nextName }).eq('id', roomId);
      if (error) throw error;

      setDisplayName(nextName);
      setShowGroupNameModal(false);

      handleSend(`🛠️ 群組名稱已更新為：${nextName}`, 'TEXT', true);
    } catch (e: any) {
      console.error('[ChatScreen] update group name error:', e);
      Alert.alert('更新失敗', e?.message || '請稍後再試。');
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleChangeGroupImage = async () => {
    if (!canManageGroup) return Alert.alert('權限不足', '只有管理員或擁有者可以修改群組圖片。');
    if (!user || !roomId) return;

    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
      includeBase64: true,
    });

    if (!result.assets?.[0]) return;
    const asset = result.assets[0];

    if (!asset.base64) {
      Alert.alert('失敗', '拿不到圖片 base64，請換一張或檢查權限。');
      return;
    }

    const mimeType = asset.type || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';

    setIsUpdatingGroup(true);
    try {
      const binary = decode(asset.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const filePath = `group-avatars/${roomId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from('chat-images').upload(filePath, bytes.buffer, {
        contentType: mimeType,
        upsert: true,
      });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error('拿不到 public url');

      const { error: dbErr } = await supabase.from('chat_rooms').update({ avatar_url: publicUrl }).eq('id', roomId);
      if (dbErr) throw dbErr;

      setGroupAvatarUrl(publicUrl);
      handleSend('🖼️ 群組圖片已更新', 'TEXT', true);
      Alert.alert('成功', '群組圖片已更新');
    } catch (e: any) {
      console.error('[ChatScreen] upload group avatar error:', e);
      Alert.alert('更新失敗', e?.message || '無法更新群組圖片，請稍後再試。');
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  // -----------------------
  // Group management
  // -----------------------
  const handleAddUser = () => {
    if (!canManageGroup) return Alert.alert('權限不足', '只有管理員或擁有者可以添加用戶。');
    if (!user || !roomId) return;
    navigation.navigate('AddGroupMemberScreen', { roomId });
  };

  // -----------------------
  // UI Helpers
  // -----------------------
  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const shouldShow = offsetY > 300;

    if (!shouldShow && showScrollBottom) setUnreadNewMsgCount(0);
    setShowScrollBottom(shouldShow);
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
  const isImageUrl = (content: string) => content.includes('chat-images') || content.includes('/storage/v1/object/public/');

  // -----------------------
  // Render item
  // -----------------------
  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const nextItem = messages[index + 1];
    const showDateHeader = !nextItem || !isSameDay(item.createdAt, nextItem.createdAt);

    const isTransfer = !!item.isServer && isTransferText(item.content);
    const isSystem = !!item.isServer && !isTransfer;
    const isImage = isImageUrl(item.content) || item.type === 'IMAGE';

    const showSenderInfo = isGroup && !item.fromMe && !isSystem;
    const sender = roomMembers.get(item.senderId);

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

    return (
      <View style={styles.itemContainer}>
        {showDateHeader && <DateHeader dateLabel={getDateLabel(item.createdAt)} />}

        <View style={[styles.groupMessageRow, item.fromMe ? styles.meRow : styles.otherRow]}>
          {showSenderInfo && (
            <Image source={{ uri: sender?.avatarUrl || getAvatarUrl(item.senderId) }} style={styles.groupAvatarSmall} />
          )}

          <View style={[styles.messageContentBlock, item.fromMe && styles.messageContentBlockMe]}>
            {showSenderInfo && <Text style={styles.senderName}>{sender?.displayName || item.senderId}</Text>}

            <View style={[styles.messageBubbleWrapper, item.fromMe ? styles.meWrapper : styles.otherWrapper]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onLongPress={() => {
                  if (!isImage && !isTransfer && !isSystem) {
                    Clipboard.setString(item.content);
                    Alert.alert('已複製', '訊息內容已複製到剪貼簿。');
                  }
                }}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isTransfer ? styles.transferBubble : item.fromMe ? styles.meBubble : styles.otherBubble,
                    { opacity: item.isPending ? 0.6 : 1 },
                    isImage && { padding: 0, backgroundColor: 'transparent', borderWidth: 0 },
                  ]}
                >
                  {isImage ? (
                    <TouchableOpacity
                      onPress={() => handleImagePress(item.content)}
                      onLongPress={() => handleImageLongPress(item.content)}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: item.content }} style={styles.chatImage} resizeMode="cover" />
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.messageText, isTransfer ? styles.transferText : item.fromMe ? styles.meText : styles.otherText]}>
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
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // -----------------------
  // Render
  // -----------------------
  return (
    <ScreenContainer>
      <TopBar coins={coins} unreadCount={unread.total} />

      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.black} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          {isGroup ? (
            <View style={styles.avatarContainer}>
              {groupHeaderAvatarUri ? (
                <Image source={{ uri: groupHeaderAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <View style={[styles.avatarImage, styles.groupAvatar]}>
                  <Ionicons name="people" size={20} color={COLORS.primary} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.avatarContainer}>
              <Image source={{ uri: targetAvatarUrl || fallbackAvatar(targetUserId || 'user') }} style={styles.avatarImage} resizeMode="cover" />
              {isTargetOnline && <View style={styles.onlineBadge} />}
            </View>
          )}

          <View>
            <Text style={styles.headerTitle}>{displayName}</Text>

            {!isGroup && (
              <Text style={[styles.headerStatus, { color: isTargetOnline ? '#10B981' : '#9CA3AF' }]}>
                {isTargetOnline ? '在線' : '離線'}
              </Text>
            )}

            {isGroup && (
              <Text style={styles.headerStatus}>
                {roomMembers.size} 位成員 {userRole && userRole !== 'member' && `(${userRole === 'owner' ? '擁有者' : '管理員'})`}
              </Text>
            )}
          </View>
        </View>

        {/* Group manage */}
        {isGroup && canManageGroup && (
          <TouchableOpacity
            onPress={() =>
              Alert.alert('群組管理', '選擇操作', [
                { text: '添加用戶', onPress: handleAddUser },
                { text: '修改名稱', onPress: handleChangeGroupName },
                { text: '修改圖片', onPress: handleChangeGroupImage },
                { text: '取消', style: 'cancel' },
              ])
            }
            style={styles.groupManageButton}
          >
            <Ionicons name="settings-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={styles.keyboardContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!roomReady || isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{!roomReady ? '建立聊天室中...' : '載入中...'}</Text>
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
            {isUploading ? <ActivityIndicator size="small" color="#666" /> : <Ionicons name="image-outline" size={24} color="#666" />}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowTransferModal(true)} style={styles.actionButton} disabled={!roomReady || isGroup}>
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
            <Text style={styles.modalSubtitle}>給: {displayName}</Text>
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

              <TouchableOpacity style={styles.modalConfirm} onPress={handleTransfer} disabled={isTransferring}>
                {isTransferring ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>發送</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Group Name Modal */}
      <Modal visible={showGroupNameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>修改群組名稱</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="輸入新群組名稱"
              value={groupNameDraft}
              onChangeText={setGroupNameDraft}
              maxLength={30}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowGroupNameModal(false)} disabled={isUpdatingGroup}>
                <Text style={{ color: '#666' }}>取消</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalConfirm} onPress={saveGroupName} disabled={isUpdatingGroup}>
                {isUpdatingGroup ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>儲存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Preview Modal（只給聊天訊息圖片用；群組頭貼不會觸發） */}
      <Modal visible={imageModalVisible} transparent animationType="none" onRequestClose={handleCloseImageModal}>
        <Animated.View
          style={[
            styles.modalBackground,
            {
              opacity: pan.y.interpolate({
                inputRange: [0, height * 0.8],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />

        <Animated.View style={[styles.imageModalContentContainer, { transform: pan.getTranslateTransform() }]} {...panResponder.panHandlers}>
          {isImageLoading && (
            <View style={styles.imageLoader}>
              <ActivityIndicator size="large" color="#FFF" />
              <Text style={styles.imageLoaderText}>圖片載入中...</Text>
            </View>
          )}

          <Animated.Image
            source={{ uri: currentImageUrl }}
            style={[
              styles.fullScreenImage,
              {
                opacity: isImageLoading ? 0 : 1,
                transform: [
                  {
                    scale: pan.y.interpolate({
                      inputRange: [0, height * 0.8],
                      outputRange: [1, 0.9],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
            resizeMode="contain"
            onLoadEnd={() => setIsImageLoading(false)}
          />

          <TouchableOpacity style={styles.imageModalCloseButton} onPress={handleCloseImageModal}>
            <Ionicons name="close-circle" size={40} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.imageModalDownloadButton} onPress={() => handleImageLongPress(currentImageUrl)}>
            <Ionicons name="cloud-download" size={30} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </ScreenContainer>
  );
};

// -----------------------
// Styles
// -----------------------
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
    justifyContent: 'space-between',
  },
  backButton: { padding: 4, marginRight: 8 },
  groupManageButton: { padding: 4, marginLeft: 8 },

  headerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: '#1F2937' },
  headerStatus: { fontSize: 12, fontWeight: '500' },

  avatarContainer: { width: 40, height: 40, marginRight: 10, position: 'relative' },
  groupAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0E7FF',
  },
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

  groupMessageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    width: '100%',
    alignItems: 'flex-start',
  },
  meRow: { justifyContent: 'flex-end', paddingLeft: '15%' },
  otherRow: { justifyContent: 'flex-start' },

  groupAvatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
    backgroundColor: '#F3F4F6',
  },
  messageContentBlock: {
    flexShrink: 1,
    alignItems: 'flex-start',
    maxWidth: '85%',
  },
  messageContentBlockMe: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
    marginLeft: 10,
  },

  messageBubbleWrapper: { marginVertical: 4, width: '100%' },
  meWrapper: { alignItems: 'flex-end' },
  otherWrapper: { alignItems: 'flex-start' },

  messageBubble: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingBottom: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    position: 'relative',
  },
  meBubble: { backgroundColor: COLORS.secondary, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E7EB' },

  transferBubble: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1 },
  transferText: { color: '#B45309', fontWeight: 'bold' },

  messageText: {
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
    marginRight: 4,
  },
  meText: { color: '#000000' },
  otherText: { color: '#000000' },

  chatImage: { width: 200, height: 200, borderRadius: 10, backgroundColor: '#eee' },

  timestamp: {
    fontSize: 10,
    position: 'absolute',
    bottom: 4,
    color: '#9CA3AF',
  },
  meTimestamp: { right: 8, left: undefined },
  otherTimestamp: { right: 8, left: undefined },

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

  modalBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  imageModalContentContainer: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width,
    height,
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  imageModalDownloadButton: {
    position: 'absolute',
    bottom: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  imageLoader: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width,
    height,
    zIndex: 5,
  },
  imageLoaderText: {
    marginTop: 10,
    color: '#FFF',
    fontSize: 14,
  },
});