
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, TextInput, Switch } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { ScreenContainer } from '../components';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useShopItems } from '../hooks/useShopItems';
import { AvatarEditor } from '../components/AvatarEditor';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { getAvatarUrl } from '../utils/avatar';

type UserProfile = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  allow_chat: boolean;
  school_code: string | null;
  school_name: string | null;
  avatar_url: string | null;
  current_avatar_params: Record<string, any> | null;
};

type OwnedPart = {
  id: string;
  type: string;
  name: string;
  avatarParams: Record<string, any> | null;
};

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const { items: shopItemsRaw } = useShopItems();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [allowChat, setAllowChat] = useState(true);

  // ✅ 這兩個就是「草稿」：AvatarEditor 改它們，但不直接存 DB
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | null>(null);
  const [draftAvatarParams, setDraftAvatarParams] = useState<Record<string, any>>({});

  const ownedParts: OwnedPart[] = useMemo(() => {
    const owned = new Set(ownedIds);
    return (shopItemsRaw ?? [])
      .filter((it: any) => owned.has(it.id) && it.type !== 'filter')
      .map((it: any) => ({
        id: it.id,
        type: it.type,
        name: it.name,
        avatarParams: it.avatar_params ?? null,
      }));
  }, [shopItemsRaw, ownedIds]);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [pRes, ownedRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('user_id,email,display_name,allow_chat,school_code,school_name,avatar_url,current_avatar_params')
          .eq('user_id', user.id)
          .single(),
        supabase.from('shop_purchases').select('item_id').eq('user_id', user.id),
      ]);

      if (pRes.error && pRes.error.code !== 'PGRST116') throw pRes.error;

      const p = (pRes.data as any) as UserProfile | null;
      setProfile(p);

      setDisplayName(p?.display_name ?? '');
      setAllowChat(!!p?.allow_chat);

      // ✅ 初始化草稿頭像
      const params = (p?.current_avatar_params ?? {}) as Record<string, any>;
      setDraftAvatarParams(params);

      // 若 db avatar_url 是 null，就用 dicebear + params 生成
      const initialUrl =
        p?.avatar_url ??
        getAvatarUrl(user.id, 'adventurer-neutral', { ...params });

      setDraftAvatarUrl(initialUrl);

      if (ownedRes.error) {
        setOwnedIds([]);
      } else {
        setOwnedIds((ownedRes.data ?? []).map((r: any) => r.item_id));
      }
    } catch (e: any) {
      Alert.alert('錯誤', e?.message ?? '載入個人資料失敗');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ✅ 只留一個 Save：一次存基本資料 + 頭像
  const saveAll = useCallback(async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: displayName.trim() || null,
          allow_chat: allowChat,
          avatar_url: draftAvatarUrl,
          current_avatar_params: draftAvatarParams, // 還原時會是 {}
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      Alert.alert('成功', '設定已儲存');
      // await fetchAll();
    } catch (e: any) {
      Alert.alert('儲存失敗', e?.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  }, [user?.id, displayName, allowChat, draftAvatarUrl, draftAvatarParams, fetchAll]);

  if (!user?.id) return null;

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>設定與個人資料</Text>
          <View style={[styles.saveButton, { width: 60, backgroundColor: '#E5E7EB' }]} />
        </View>

        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 16, color: COLORS.gray }}>載入中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={COLORS.black} />
        </TouchableOpacity>

        <Text style={styles.pageTitle}>設定與個人資料</Text>

        {/* ✅ 唯一的儲存按鈕 */}
        <TouchableOpacity onPress={saveAll} style={styles.saveButton} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>儲存</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40, backgroundColor: '#F9FAFB' }}>
        <AvatarEditor
          userId={user.id}
          avatarUrl={draftAvatarUrl}
          avatarParams={draftAvatarParams}
          ownedParts={ownedParts}
          onChange={({ avatar_url, current_avatar_params }) => {
            setDraftAvatarUrl(avatar_url);
            setDraftAvatarParams(current_avatar_params ?? {});
          }}
        />

        <Text style={styles.sectionTitle}>基本資料</Text>

        <View style={styles.row}>
          <Text style={styles.label}>顯示名稱</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="顯示名稱"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={[styles.row, { paddingVertical: SPACING.sm }]}>
          <Text style={styles.label}>允許聊天</Text>
          <Switch
            trackColor={{ false: '#767577', true: COLORS.primary }}
            thumbColor={allowChat ? COLORS.secondary : '#f4f3f4'}
            onValueChange={setAllowChat}
            value={allowChat}
          />
        </View>

        <Text style={styles.sectionTitle}>帳號資訊</Text>

        <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{profile?.email ?? user?.email ?? '-'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>學校</Text><Text style={styles.value}>{profile?.school_name ?? '-'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>學校代碼</Text><Text style={styles.value}>{profile?.school_code ?? '-'}</Text></View>

        <TouchableOpacity style={styles.signOutWrap} onPress={signOut} disabled={saving}>
          <View style={styles.signOutBtn}>
            <Ionicons name="log-out-outline" size={22} color="#fff" />
            <Text style={styles.signOutText}>登出帳號</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#fff',
  },
  backButton: { padding: 5, borderRadius: 24 },
  pageTitle: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, color: COLORS.black },
  saveButton: { backgroundColor: COLORS.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: FONT_SIZES.md },
  loadingOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  sectionTitle: {
    fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, color: '#374151',
    marginTop: SPACING.lg, marginBottom: SPACING.md, paddingHorizontal: SPACING.md,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  label: { fontSize: FONT_SIZES.md, color: '#6B7280', fontWeight: '500', width: '35%' },
  value: { fontSize: FONT_SIZES.md, color: COLORS.black, flex: 1, textAlign: 'right' },
  input: {
    flex: 1, borderWidth: 0, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: FONT_SIZES.md, textAlign: 'right', marginLeft: SPACING.md, color: COLORS.black,
  },
  signOutWrap: { alignItems: 'center', marginTop: SPACING.lg, marginBottom: SPACING.lg },
  signOutBtn: {
    backgroundColor: '#EF4444', paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg * 2,
    borderRadius: 8, flexDirection: 'row', alignItems: 'center',
  },
  signOutText: { color: '#fff', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.md, marginLeft: SPACING.sm },
});