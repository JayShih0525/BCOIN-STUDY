/**
 * GuildScreen
 * 公會頁面 - 全國學校排行榜 (現代化卡片設計版)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput, // <--- 1. Import TextInput
} from 'react-native';
import { ScreenContainer, TopBar } from '../components';
import { useCoinsContext } from '../context/CoinsContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useChatConnectOnFocus } from '../utils/chatClient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useUnread } from '../context/UnreadContext';     // 用來拿未讀數字

type GuildNavProp = NativeStackNavigationProp<RootStackParamList>;

type RankingItem = {
  rank: number;
  label: string;     // 顯示學校名稱
  seconds: number;   // 總秒數
  subtitle?: string | null;     // 例如「X 位使用者」
  schoolCode?: string | null;   // 學校代碼
};

type GlobalRankingRow = {
  school_code: string | null;
  school_name: string | null;
  total_seconds: number | null;
  user_count: number | null;
  rank: number;
};

// 輔助函式：取得排名的顏色
const getRankColor = (rank: number) => {
  switch (rank) {
    case 1: return '#FFD700'; // 金牌
    case 2: return '#C0C0C0'; // 銀牌
    case 3: return '#CD7F32'; // 銅牌
    default: return '#6B7280'; // 其他名次顯示灰色
  }
};

export const GuildScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const { coins } = useCoinsContext();
  const navigation = useNavigation<GuildNavProp>();

  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { unread } = useUnread();
  useChatConnectOnFocus(user?.id);

  // 2. Add Search State
  const [searchQuery, setSearchQuery] = useState('');

  // 目前登入者的學校代碼，用來比對上色
  const [mySchoolCode, setMySchoolCode] = useState<string | null>(null);

  /** 將秒數轉成人類可讀字串 */
  const formatSeconds = (sec: number) => {
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h === 0 && m === 0) return '0 分鐘';
    if (h === 0) return `${m} 分鐘`;
    return `${h} 小時 ${m} 分`;
  };

  /** 取得全國學校排行榜（global_ranking） */
  const fetchGlobalRanking = useCallback(
    async (options?: { asRefresh?: boolean }): Promise<RankingItem[] | null> => {
      const isRefresh = options?.asRefresh;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setErrorMsg(null);

      try {
        const { data, error } = await supabase.rpc('global_ranking');
        if (error) {
          console.error('global_ranking error:', error);
          setErrorMsg('取得全國排行榜失敗');
          return null;
        }

        const rows = (data || []) as GlobalRankingRow[];

        const items: RankingItem[] = rows.map((row) => ({
          rank: row.rank,
          label: row.school_name ?? row.school_code ?? '未知學校',
          seconds: row.total_seconds ?? 0,
          subtitle: row.user_count != null ? `${row.user_count} 位使用者` : null,
          schoolCode: row.school_code ?? undefined,
        }));

        return items;
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    []
  );

  /** 第一次進入畫面：先抓自己的學校代碼，再抓全國排行 */
  useEffect(() => {
    (async () => {
      if (user) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('school_code')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data?.school_code) {
          setMySchoolCode(data.school_code);
        }
      }

      const items = await fetchGlobalRanking();
      if (items) {
        setRanking(items);
      }
    })();
  }, [user, fetchGlobalRanking]);

  // 3. Filter Logic (Instant filtering)
  const filteredRanking = ranking.filter((item) => {
    const query = searchQuery.toLowerCase();
    return item.label.toLowerCase().includes(query);
  });

  const handleRefresh = () => {
    void (async () => {
      const items = await fetchGlobalRanking({ asRefresh: true });
      if (items) {
        setRanking(items);
      }
    })();
  };

  const handlePressRow = (item: RankingItem) => {
    if (!item.schoolCode) return;
    navigation.navigate('SchoolDetail', {
      schoolCode: item.schoolCode,
      schoolName: item.label,
    });
  };

  return (
    <ScreenContainer>
      <TopBar 
        coins={coins} 
        unreadCount={unread.total}
      />

      <View style={styles.container}>
        {/* 標題區域 */}
        <View style={styles.headerContainer}>
          <Text style={styles.title}>全國學校排行榜</Text>
          <Text style={styles.subtitlePage}>依累積專注時間排序</Text>
        </View>

        {/* 4. Search Bar UI */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜尋學校名稱..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing" // iOS 'x' button
          />
        </View>

        {/* 錯誤訊息 */}
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        {/* 初次載入中的 spinner */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.black} />
            <Text style={{ marginTop: 8 }}>載入中...</Text>
          </View>
        )}

        {/* 排行榜列表 */}
        {!loading && (
          <FlatList
            data={filteredRanking} // <--- 5. Use filtered data
            keyExtractor={(item) => `${item.rank}-${item.label}`}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => {
              const isMySchool =
                mySchoolCode != null &&
                item.schoolCode != null &&
                item.schoolCode === mySchoolCode;

              const rankColor = getRankColor(item.rank);
              const isTop3 = item.rank <= 3;

              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handlePressRow(item)}
                  style={[
                    styles.card,
                    isMySchool && styles.mySchoolCard,
                  ]}
                >
                  <View style={[styles.rankContainer, isTop3 && { backgroundColor: rankColor + '20' }]}>
                    <Text style={[styles.rankText, { color: rankColor }]}>
                      {item.rank}
                    </Text>
                  </View>

                  <View style={styles.infoContainer}>
                    <View style={styles.nameRow}>
                      <Text style={styles.schoolName} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {isMySchool && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>我的學校</Text>
                        </View>
                      )}
                    </View>
                    
                    {!!item.subtitle && (
                      <Text style={styles.memberCount}>
                        👥 {item.subtitle}
                      </Text>
                    )}
                  </View>

                  <View style={styles.timeContainer}>
                    <Text style={styles.timeLabel}>累積專注</Text>
                    <Text style={[styles.timeValue, isMySchool && styles.mySchoolTimeText]}>
                      {formatSeconds(item.seconds)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.emptyText}>
                  {searchQuery.length > 0 
                    ? '找不到符合的學校' 
                    : '目前尚無排行資料'}
                </Text>
              ) : null
            }
          />
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: '#F9FAFB',
  },
  
  headerContainer: {
    marginBottom: SPACING.md, // Reduced margin to fit search bar better
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subtitlePage: {
    fontSize: FONT_SIZES.md,
    color: '#6B7280',
    fontWeight: '500',
  },

  // --- 6. Search Bar Styles ---
  searchContainer: {
    paddingHorizontal: 0,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },

  // --- Cards ---
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  mySchoolCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },

  rankContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#F3F4F6',
  },
  rankText: {
    fontSize: 18,
    fontWeight: '900',
  },

  infoContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  schoolName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#1F2937',
    flexShrink: 1,
    marginRight: 6,
  },
  memberCount: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  badge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },

  timeContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 70,
  },
  timeLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4B5563',
    fontVariant: ['tabular-nums'],
  },
  mySchoolTimeText: {
    color: '#B45309',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 16,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 32,
    color: '#9CA3AF',
    fontSize: 16,
  },
});