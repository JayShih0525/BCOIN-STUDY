// src/screens/SchoolDetailScreen.tsx

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../types/navigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// 1. Import Ionicons
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useUnread } from '../context/UnreadContext';     // 用來拿未讀數字
import { useChatConnectOnFocus } from '../utils/chatClient';

type SchoolDetailRouteProp = RouteProp<RootStackParamList, 'SchoolDetail'>;
type SchoolDetailNavProp = NativeStackNavigationProp<
  RootStackParamList,
  'SchoolDetail'
>;

type SchoolUserRow = {
  user_id: string;
  email: string | null;
  school_code: string | null;
  school_name: string | null;
  total_seconds: number | null;
  rank: number;
  allow_chat?: boolean | null;
};

const getRankColor = (rank: number) => {
  switch (rank) {
    case 1: return '#FFD700';
    case 2: return '#C0C0C0';
    case 3: return '#CD7F32';
    default: return '#1051d3ff';
  }
};

const getRankTextColor = (rank: number) => {
  return rank <= 3 ? '#FFFFFF' : '#6B7280';
};

export const SchoolDetailScreen: React.FC = () => {
  const route = useRoute<SchoolDetailRouteProp>();
  const navigation = useNavigation<SchoolDetailNavProp>();
  const { user, signOut } = useAuth();
  const { coins } = useCoinsContext();
  useChatConnectOnFocus(user?.id);

  const { schoolCode, schoolName } = route.params;

  const [members, setMembers] = useState<SchoolUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); 
  const { unread } = useUnread();

  const formatSeconds = (sec: number | null | undefined) => {
    const total = Math.max(0, Math.floor(sec ?? 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h === 0 && m === 0) return '0m';
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const loadMembers = useCallback(
    async (options?: { asRefresh?: boolean }) => {
      const isRefresh = options?.asRefresh;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { data, error } = await supabase.rpc('school_ranking', {
          p_school_code: schoolCode,
        });

        if (error) {
          console.error('school_ranking error:', error);
          Alert.alert('錯誤', '載入學校成員排行失敗');
          setMembers([]);
          return;
        }

        const rows = (data ?? []) as SchoolUserRow[];
        setMembers(
          rows.map((row) => ({
            ...row,
            email: row.email ?? '',
            total_seconds: row.total_seconds ?? 0,
            allow_chat: row.allow_chat ?? false,
          })),
        );
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [schoolCode],
  );

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const filteredMembers = members.filter((member) => {
    const displayName = (member.email ?? '').split('@')[0] || '';
    const query = searchQuery.toLowerCase();
    return displayName.toLowerCase().includes(query);
  });

  const handleRefresh = () => {
    void loadMembers({ asRefresh: true });
  };

  const handlePressChat = (target: SchoolUserRow) => {
    if (!target.allow_chat) {
      Alert.alert('無法聊天', '對方尚未開啟聊天功能。');
      return;
    }
    if (!user) {
      Alert.alert('請先登入', '登入後才可以聊天');
      return;
    }
    if (user.id === target.user_id) {
      Alert.alert('提醒', '不能跟自己聊天啦 😆');
      return;
    }
    const name = (target.email ?? '').split('@')[0] || 'User';
    navigation.navigate('Chat', {
      targetUserId: target.user_id,
      targetUserName: name,
    });
  };

  const renderItem = ({ item }: { item: SchoolUserRow }) => {
    const isMe = user?.id === item.user_id;
    const rankBgColor = getRankColor(item.rank);
    const rankTextColor = getRankTextColor(item.rank);
    const displayName = (item.email ?? '').split('@')[0] || 'User';

    return (
      <View style={[styles.card, isMe && styles.myCard]}>
        <View style={[styles.rankContainer, { backgroundColor: rankBgColor }]}>
          <Text style={[styles.rankText, { color: rankTextColor }]}>{item.rank}</Text>
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            {isMe && (
              <View style={styles.meBadge}>
                <Text style={styles.meBadgeText}>YOU</Text>
              </View>
            )}
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.timeText}>{formatSeconds(item.total_seconds)}</Text>
          </View>
        </View>

        <View style={styles.actionContainer}>
          {isMe ? (
            <View style={styles.meStatusBadge}>
              <Text style={styles.meStatusText}>NOT CHAT</Text>
            </View>
          ) : item.allow_chat ? (
            <TouchableOpacity
              style={styles.chatButton}
              activeOpacity={0.8}
              onPress={() => handlePressChat(item)}
            >
              <Text style={styles.chatButtonText}>Chat</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.disabledBadge}>
              <Text style={styles.disabledText}>Private</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <TopBar 
        coins={coins} 
        unreadCount={unread.total}
      />

      <View style={styles.container}>
        
        {/* 2. Modified Header Structure */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={28} color="#111827" />
          </TouchableOpacity>
          
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>{schoolName}</Text>
            <Text style={styles.subtitle}>校內專注排行榜</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜尋學生名稱..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={filteredMembers}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || loading}
              onRefresh={handleRefresh}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {loading 
                  ? '載入中...' 
                  : searchQuery.length > 0 
                    ? '找不到符合的學生' 
                    : '目前沒有成員資料'}
              </Text>
            </View>
          }
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  // 3. Updated Header Styles
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    flexDirection: 'row', // Make it a row
    alignItems: 'center', // Align vertically
  },
  backButton: {
    marginRight: 12, // Space between arrow and text
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6', // Optional: subtle background for button
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: '#6B7280',
    fontWeight: '500',
  },
  
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 10,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 20,
    paddingTop: 8,
  },
  
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  myCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  rankContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '800',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#374151',
    marginRight: 6,
  },
  meBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  meBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  actionContainer: {
    minWidth: 70,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  chatButton: {
    flexDirection: 'row',
    backgroundColor: '#0EA5E9',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  chatButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  meStatusBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  meStatusText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '700',
  },
  disabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  disabledText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 2,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});

export default SchoolDetailScreen;