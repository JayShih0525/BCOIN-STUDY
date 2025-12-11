/**
 * GuildScreen
 * 公會頁面 - 排行榜，可切換「校內 / 全國」
 * 只在「第一次進入 / 第一次切到該模式 / 下拉更新」時才打 API。
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
} from 'react-native';
import { ScreenContainer, TopBar } from '../components';
import { useCoinsContext } from '../context/CoinsContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type RankingItem = {
  rank: number;
  label: string;     // 顯示名字（學校名或使用者）
  seconds: number;   // 總秒數
  subtitle?: string | null; // 補充資訊（例如 user_count 或 school_name）
};

type GlobalRankingRow = {
  school_code: string | null;
  school_name: string | null;
  total_seconds: number | null;
  user_count: number | null;
  rank: number;
};

type SchoolRankingRow = {
  user_id: string;
  email: string;
  school_code: string | null;
  school_name: string | null;
  total_seconds: number | null;
  rank: number;
};

export const GuildScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const { coins } = useCoinsContext();

  const [mode, setMode] = useState<'school' | 'global'>('school');

  // 目前畫面顯示的排行榜
  const [ranking, setRanking] = useState<RankingItem[]>([]);

  // ⭐ 個別模式的快取
  const [schoolRanking, setSchoolRanking] = useState<RankingItem[] | null>(null);
  const [globalRanking, setGlobalRanking] = useState<RankingItem[] | null>(null);

  const [loading, setLoading] = useState(false);      // 初次載入 / 首次切換某模式
  const [refreshing, setRefreshing] = useState(false); // 下拉更新
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /** 將秒數轉成人類可讀字串 */
  const formatSeconds = (sec: number) => {
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h === 0 && m === 0) return '0 分鐘';
    if (h === 0) return `${m} 分鐘`;
    return `${h} 小時 ${m} 分`;
  };

  /** 取得全國學校排行榜（global_ranking），回傳資料給呼叫者去塞 state */
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
        }));

        return items;
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    []
  );

  /** 查出自己的 school_code，再呼叫 school_ranking，回傳 RankingItem 陣列 */
  const fetchSchoolRanking = useCallback(
    async (options?: { asRefresh?: boolean }): Promise<RankingItem[] | null> => {
      const isRefresh = options?.asRefresh;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setErrorMsg(null);

      try {
        if (!user) {
          setErrorMsg('尚未登入，無法查看校內排行');
          return null;
        }

        // 1️⃣ 先查 user_school_view 取得自己學校代碼
        const { data: schoolRow, error: schoolError } = await supabase
          .from('user_school_view')
          .select('school_code, school_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (schoolError) {
          console.error('user_school_view error:', schoolError);
          setErrorMsg('無法判斷你的學校資訊');
          return null;
        }

        if (!schoolRow || !schoolRow.school_code) {
          setErrorMsg('你的 email 無法對應到任何學校');
          return null;
        }

        const schoolCode = schoolRow.school_code as string;

        // 2️⃣ 用 school_code 呼叫校內排行榜 RPC
        const { data, error } = await supabase.rpc('school_ranking', {
          p_school_code: schoolCode,
        });

        if (error) {
          console.error('school_ranking error:', error);
          setErrorMsg('取得校內排行榜失敗');
          return null;
        }

        const rows = (data || []) as SchoolRankingRow[];

        const items: RankingItem[] = rows.map((row) => ({
          rank: row.rank,
          label: row.email?.split('@')[0] ?? '未知使用者',
          seconds: row.total_seconds ?? 0,
          subtitle: row.school_name ?? schoolRow.school_name ?? null,
        }));

        return items;
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [user]
  );

  /** ✅ 第一次進入畫面：只載入一次「校內」排行並存快取 */
  useEffect(() => {
    (async () => {
      if (!schoolRanking) {
        const items = await fetchSchoolRanking();
        if (items) {
          setSchoolRanking(items);
          setRanking(items);
        }
      } else {
        // 如果已經有快取（理論上初次不會發生），直接用
        setRanking(schoolRanking);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在 mount 時執行一次

  /** ✅ 切換「校內 / 全國」時：
   *  - 若該模式有快取 -> 直接使用快取，不打 API
   *  - 若沒有快取 -> 打一次 API，並存到快取
   */
  const handleChangeMode = (nextMode: 'school' | 'global') => {
    if (nextMode === mode) return;

    setMode(nextMode);

    if (nextMode === 'global') {
      if (globalRanking) {
        setRanking(globalRanking);
      } else {
        (async () => {
          const items = await fetchGlobalRanking();
          if (items) {
            setGlobalRanking(items);
            setRanking(items);
          }
        })();
      }
    } else {
      if (schoolRanking) {
        setRanking(schoolRanking);
      } else {
        (async () => {
          const items = await fetchSchoolRanking();
          if (items) {
            setSchoolRanking(items);
            setRanking(items);
          }
        })();
      }
    }
  };

  /** ✅ 下拉更新：依目前模式重新抓，並覆蓋快取 */
  const handleRefresh = () => {
    if (mode === 'global') {
      (async () => {
        const items = await fetchGlobalRanking({ asRefresh: true });
        if (items) {
          setGlobalRanking(items);
          setRanking(items);
        }
      })();
    } else {
      (async () => {
        const items = await fetchSchoolRanking({ asRefresh: true });
        if (items) {
          setSchoolRanking(items);
          setRanking(items);
        }
      })();
    }
  };

  return (
    <ScreenContainer>
      <TopBar coins={coins} onSettingsPress={signOut} />

      <View style={styles.container}>
        {/* ⭐ 按鈕 - 切換模式 */}
        <View style={styles.modeSwitchContainer}>
          <TouchableOpacity
            style={[styles.switchButton, mode === 'school' && styles.activeButton]}
            onPress={() => handleChangeMode('school')}
          >
            <Text style={[styles.switchText, mode === 'school' && styles.activeText]}>
              校內
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.switchButton, mode === 'global' && styles.activeButton]}
            onPress={() => handleChangeMode('global')}
          >
            <Text style={[styles.switchText, mode === 'global' && styles.activeText]}>
              全國
            </Text>
          </TouchableOpacity>
        </View>

        {/* ⭐ 錯誤訊息 */}
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        {/* ⭐ 初次載入 / 首次切某模式時的 Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.black} />
            <Text style={{ marginTop: 8 }}>載入中...</Text>
          </View>
        )}

        {/* ⭐ 排行榜 + 下拉更新（平常只動這個） */}
        {!loading && (
          <FlatList
            data={ranking}
            keyExtractor={(item) => `${mode}-${item.rank}-${item.label}`}
            style={{ width: '100%', marginTop: 15 }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.rank}>{item.rank}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.label}</Text>
                  {!!item.subtitle && (
                    <Text style={styles.subtitle}>{item.subtitle}</Text>
                  )}
                </View>
                <Text style={styles.time}>{formatSeconds(item.seconds)}</Text>
              </View>
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListEmptyComponent={
              !loading ? (
                <Text style={{ textAlign: 'center', marginTop: 16 }}>
                  目前尚無排行資料
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
    padding: SPACING.lg,
    width: '100%',
  },

  /** ⭐ 切換按鈕區 */
  modeSwitchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  switchButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#EDEDED',
  },
  activeButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.black,
  },
  switchText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  activeText: {
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
  },

  /** ⭐ 排行榜列 */
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginVertical: 4,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    alignItems: 'center',
  },
  rank: {
    width: 40,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  name: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    opacity: 0.6,
  },
  time: {
    fontSize: FONT_SIZES.sm,
    opacity: 0.7,
  },

  loadingContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 8,
  },
});