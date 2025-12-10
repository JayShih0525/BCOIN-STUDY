/**
 * GuildScreen
 * 公會頁面 - 內部直接顯示排行榜，可切換「校內 / 全國」
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { ScreenContainer, TopBar } from '../components';
import { useCoins } from '../hooks/useCoins';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useIsFocused } from '@react-navigation/native';

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
  const { coins, refresh: refreshCoins } = useCoins(user?.id ?? null);
  const isFocused = useIsFocused();

  const [mode, setMode] = useState<'school' | 'global'>('school');
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(false);
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

  /** 取得全國學校排行榜（global_ranking） */
  const fetchGlobalRanking = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('global_ranking');
      if (error) {
        console.error('global_ranking error:', error);
        setErrorMsg('取得全國排行榜失敗');
        setRanking([]);
        return;
      }

      const rows = (data || []) as GlobalRankingRow[];

      const items: RankingItem[] = rows.map((row) => ({
        rank: row.rank,
        label: row.school_name ?? row.school_code ?? '未知學校',
        seconds: row.total_seconds ?? 0,
        subtitle: row.user_count != null ? `${row.user_count} 位使用者` : null,
      }));

      setRanking(items);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 先從 user_school_view 找出自己的 school_code，再叫 school_ranking */
  const fetchSchoolRanking = useCallback(async () => {
    if (!user) {
      setErrorMsg('尚未登入，無法查看校內排行');
      setRanking([]);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      // 1️⃣ 先查 user_school_view 取得自己學校代碼
      const { data: schoolRow, error: schoolError } = await supabase
        .from('user_school_view')
        .select('school_code, school_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (schoolError) {
        console.error('user_school_view error:', schoolError);
        setErrorMsg('無法判斷你的學校資訊');
        setRanking([]);
        return;
      }

      if (!schoolRow || !schoolRow.school_code) {
        setErrorMsg('你的 email 無法對應到任何學校');
        setRanking([]);
        return;
      }

      const schoolCode = schoolRow.school_code as string;

      // 2️⃣ 用 school_code 呼叫校內排行榜 RPC
      const { data, error } = await supabase.rpc('school_ranking', {
        p_school_code: schoolCode,
      });

      if (error) {
        console.error('school_ranking error:', error);
        setErrorMsg('取得校內排行榜失敗');
        setRanking([]);
        return;
      }

      const rows = (data || []) as SchoolRankingRow[];

      const items: RankingItem[] = rows.map((row) => ({
        rank: row.rank,
        label: row.email?.split('@')[0] ?? '未知使用者',
        seconds: row.total_seconds ?? 0,
        subtitle: row.school_name ?? schoolRow.school_name ?? null,
      }));

      setRanking(items);
    } finally {
      setLoading(false);
    }
  }, [user]);

  /** 每次 mode 改變就重新抓資料 */
  useEffect(() => {
    if (mode === 'global') {
      fetchGlobalRanking();
    } else {
      fetchSchoolRanking();
    }
  }, [mode, fetchGlobalRanking, fetchSchoolRanking]);

  useEffect(() => {
    if (isFocused) {
      void refreshCoins();  // ⭐ 每次進入頁面刷新 coins
    }
  }, [isFocused, refreshCoins]);

  return (
    <ScreenContainer>
      <TopBar coins={coins} onSettingsPress={signOut} />

      <View style={styles.container}>
        {/* ⭐ 按鈕 - 切換模式 */}
        <View style={styles.modeSwitchContainer}>
          <TouchableOpacity
            style={[styles.switchButton, mode === 'school' && styles.activeButton]}
            onPress={() => setMode('school')}
          >
            <Text style={[styles.switchText, mode === 'school' && styles.activeText]}>
              校內
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.switchButton, mode === 'global' && styles.activeButton]}
            onPress={() => setMode('global')}
          >
            <Text style={[styles.switchText, mode === 'global' && styles.activeText]}>
              全國
            </Text>
          </TouchableOpacity>
        </View>

        {/* ⭐ 錯誤訊息 */}
        {errorMsg && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}

        {/* ⭐ Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.black} />
            <Text style={{ marginTop: 8 }}>載入中...</Text>
          </View>
        )}

        {/* ⭐ 排行榜 */}
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