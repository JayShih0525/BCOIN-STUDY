// src/screens/SchoolDetailScreen.tsx

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../types/navigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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
  rank: number;                // 來自 school_ranking
  allow_chat?: boolean | null; // 來自 view / function，可能不存在
};

// 依照排名決定圓圈背景顏色
const getRankColor = (rank: number) => {
  switch (rank) {
    case 1:
      return '#FFD700'; // 金
    case 2:
      return '#C0C0C0'; // 銀
    case 3:
      return '#CD7F32'; // 銅
    default:
      return '#1051d3ff'; // 其他顏色
  }
};

// 排名文字顏色（前三名白字）
const getRankTextColor = (rank: number) => {
  return rank <= 3 ? '#FFFFFF' : '#6B7280';
};

export const SchoolDetailScreen: React.FC = () => {
  const route = useRoute<SchoolDetailRouteProp>();
  const navigation = useNavigation<SchoolDetailNavProp>();
  const { user, signOut } = useAuth();
  const { coins } = useCoinsContext();

  const { schoolCode, schoolName } = route.params;

  const [members, setMembers] = useState<SchoolUserRow[]>([]);
  const [loading, setLoading] = useState(false);       // 初次載入 / 非下拉重新整理
  const [refreshing, setRefreshing] = useState(false); // 下拉重新整理

  // 秒數 → "Xh Ym"
  const formatSeconds = (sec: number | null | undefined) => {
    const total = Math.max(0, Math.floor(sec ?? 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h === 0 && m === 0) return '0m';
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  // ✅ 抽出共用載入 function，支援「初次／切換」與「下拉更新」
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

  // ✅ 第一次進來時載入一次
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  // ✅ 下拉更新 handler
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
        {/* 左側：排名 Badge */}
        <View style={[styles.rankContainer, { backgroundColor: rankBgColor }]}>
          <Text style={[styles.rankText, { color: rankTextColor }]}>{item.rank}</Text>
        </View>

        {/* 中間：使用者資訊 */}
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

        {/* 右側：聊天按鈕或狀態 */}
        <View style={styles.actionContainer}>
          {isMe ? (
            <Text style={styles.statusText}>Me</Text>
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
      <TopBar coins={coins} onSettingsPress={signOut} />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{schoolName}</Text>
          <Text style={styles.subtitle}>校內專注排行榜</Text>
        </View>

        {/* ✅ 不再用整頁 loading，把 loading 表現在 RefreshControl + Empty Text */}
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || loading} // 初次載入也會看到上方轉圈
              onRefresh={handleRefresh}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {loading ? '載入中...' : '目前沒有成員資料'}
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
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: '#6B7280',
    fontWeight: '500',
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
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  chatButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },

  statusText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
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