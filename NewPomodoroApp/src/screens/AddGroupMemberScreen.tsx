import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';

type UserSelection = {
  user_id: string;
  display_name: string;
  email: string;
  school_name?: string | null;
  is_in_room: boolean; // ★ 由後端直接算好
};

type SchoolOption = { label: string; value: string };

type RootStackParamList = {
  AddGroupMemberScreen: { roomId: string; onSelectUsers?: (selectedIds: string[]) => void };
};
type AddGroupMemberRouteProp = RouteProp<RootStackParamList, 'AddGroupMemberScreen'>;
type NavigationProps = NativeStackNavigationProp<RootStackParamList, 'AddGroupMemberScreen'>;

const AddGroupMemberScreen: React.FC = () => {
  const route = useRoute<AddGroupMemberRouteProp>();
  const navigation = useNavigation<NavigationProps>();
  const { user } = useAuth();

  const { roomId, onSelectUsers } = route.params;

  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>(''); // '' = 所有學校
  const [searchQuery, setSearchQuery] = useState('');

  const [allUsers, setAllUsers] = useState<UserSelection[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const handleGoBack = () => navigation.goBack();

  // --- 取得學校清單 ---
  const fetchSchoolOptions = useCallback(async () => {
    setIsLoadingSchools(true);
    try {
      const { data, error } = await supabase.rpc('fetch_unique_school_names');
      if (error) throw error;

      const options: SchoolOption[] = [{ label: '所有學校', value: '' }];
      if (Array.isArray(data)) {
        data.forEach((row: any) => {
          // 依你的 RPC 回傳型態調整：
          // 若回傳 [{ school_name: 'xxx' }, ...]
          const name = row?.school_name ?? row;
          if (name) options.push({ label: name, value: name });
        });
      }
      setSchoolOptions(options);
    } catch (e: any) {
      console.error('Error fetching schools:', e);
      setSchoolOptions([{ label: '所有學校', value: '' }]);
    } finally {
      setIsLoadingSchools(false);
    }
  }, []);

  // --- 取得使用者（含是否已在 room）+ server-side search ---
  const fetchUsers = useCallback(
    async (schoolName: string, query: string) => {
      if (!user?.id) return;
      setIsLoadingUsers(true);
      try {
        const { data, error } = await supabase.rpc('fetch_users_for_room_selection', {
          p_room_id: roomId,
          p_school_name: schoolName || null,
          p_query: query?.trim() || null,
          p_exclude_user_id: user.id, // 不顯示自己
          p_limit: 200, // 可調
          p_offset: 0,
        });

        if (error) throw error;

        setAllUsers((data || []) as UserSelection[]);
      } catch (e: any) {
        console.error('Error fetching users:', e);
        Alert.alert('錯誤', e.message || '無法載入用戶列表');
        setAllUsers([]);
      } finally {
        setIsLoadingUsers(false);
      }
    },
    [roomId, user?.id]
  );

  // 初始載入學校
  useEffect(() => {
    void fetchSchoolOptions();
  }, [fetchSchoolOptions]);

  // 當選擇學校改變 → 重新抓人（清空選取）
  useEffect(() => {
    if (isLoadingSchools) return;
    setSelectedUsers(new Set());
    void fetchUsers(selectedSchool, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchool, isLoadingSchools]);

  // 搜尋：做一個簡單 debounce，避免每按一個字就打 RPC
  useEffect(() => {
    if (isLoadingSchools) return;
    const t = setTimeout(() => {
      void fetchUsers(selectedSchool, searchQuery);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, selectedSchool, fetchUsers, isLoadingSchools]);

  const toggleUserSelection = (u: UserSelection) => {
    if (u.is_in_room) {
      Alert.alert('無法加入', '此用戶已在群組中。');
      return;
    }
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(u.user_id)) next.delete(u.user_id);
      else next.add(u.user_id);
      return next;
    });
  };

  const handleConfirmAdd = async () => {
    if (selectedUsers.size === 0) return Alert.alert('提示', '請選擇要添加的用戶。');
    if (!user) return Alert.alert('錯誤', '用戶未登入。');

    const newMembersToInvite = Array.from(selectedUsers);

    setIsLoadingUsers(true);
    try {
      const { error } = await supabase.rpc('add_user_to_group', {
        p_room_id: roomId,
        p_new_member_ids: newMembersToInvite,
        p_caller_id: user.id,
      });
      if (error) throw error;

      Alert.alert('成功', `已成功添加 ${selectedUsers.size} 位成員！`);
      onSelectUsers?.(newMembersToInvite);
      navigation.goBack();
    } catch (err: any) {
      console.error('添加用戶失敗:', err);
      const errorMessage = err?.message?.includes('PERMISSION_DENIED')
        ? '權限不足：只有群組管理員或擁有者可以執行此操作。'
        : err?.message || '發生未知錯誤，請稍後再試。';
      Alert.alert('錯誤', errorMessage);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const renderItem = ({ item }: { item: UserSelection }) => {
    const isSelected = selectedUsers.has(item.user_id);

    return (
      <TouchableOpacity
        style={[styles.userItem, item.is_in_room && styles.userItemDisabled]}
        onPress={() => toggleUserSelection(item)}
        disabled={isLoadingUsers || item.is_in_room}
      >
        <View style={styles.userInfo}>
          <Text style={[styles.userName, item.is_in_room && { color: '#9CA3AF' }]}>
            {item.display_name || '未知用戶'}
            {item.is_in_room && <Text style={styles.inRoomTag}> (已在群組)</Text>}
          </Text>

          <Text style={[styles.userEmail, item.is_in_room && { color: '#B0B6BF' }]}>{item.email}</Text>

          {!!item.school_name && (
            <Text style={[styles.userSchool, item.is_in_room && { color: '#B0B6BF' }]}>{item.school_name}</Text>
          )}
        </View>

        <Ionicons
          name={isSelected ? 'checkmark-circle' : item.is_in_room ? 'close-circle' : 'ellipse-outline'}
          size={24}
          color={isSelected ? '#10B981' : item.is_in_room ? '#9CA3AF' : '#D1D5DB'}
        />
      </TouchableOpacity>
    );
  };

  const titleSchool = useMemo(() => {
    return schoolOptions.find((o) => o.value === selectedSchool)?.label || '所有學校';
  }, [schoolOptions, selectedSchool]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>添加群組成員</Text>
        <Text style={styles.headerRoomId}>{roomId.substring(0, 8)}...</Text>
      </View>

      <View style={styles.contentContainer}>
        {/* Filters */}
        <View style={styles.filterContainer}>
          <Text style={styles.filterLabel}>大學:</Text>

          <Text
            style={styles.schoolPicker}
            onPress={() => {
              Alert.alert(
                '選擇大學',
                `當前選擇: ${titleSchool}`,
                schoolOptions.map((opt) => ({
                  text: opt.label,
                  onPress: () => setSelectedSchool(opt.value),
                }))
              );
            }}
          >
            {titleSchool} <Ionicons name="caret-down" size={14} color="#6B7280" />
          </Text>

          <TextInput
            style={styles.searchInput}
            placeholder="用姓名或 email 搜尋..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {(isLoadingSchools || isLoadingUsers) && allUsers.length === 0 ? (
          <View style={{ marginTop: 50, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={{ marginTop: 10, color: '#6B7280' }}>正在載入用戶列表...</Text>
          </View>
        ) : (
          <FlatList
            data={allUsers}
            keyExtractor={(item) => item.user_id}
            renderItem={renderItem}
            ListEmptyComponent={<Text style={styles.emptyText}>無符合條件的用戶</Text>}
          />
        )}

        <TouchableOpacity
          style={[styles.confirmButton, selectedUsers.size === 0 && styles.confirmButtonDisabled]}
          onPress={handleConfirmAdd}
          disabled={selectedUsers.size === 0 || isLoadingUsers || isLoadingSchools}
        >
          <Text style={styles.confirmButtonText}>
            {isLoadingUsers ? '處理中...' : `確認添加 (${selectedUsers.size})`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  contentContainer: { flex: 1, paddingHorizontal: 16, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 8, width: 44, alignItems: 'flex-start' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', flex: 1, textAlign: 'center' },
  headerRoomId: { fontSize: 12, color: '#6B7280', width: 44, textAlign: 'right' },

  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 8,
  },
  filterLabel: { marginRight: 8, fontSize: 16, fontWeight: 'bold', color: '#374151' },
  schoolPicker: { paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, color: '#374151' },
  searchInput: { flex: 1, height: 40, borderColor: '#D1D5DB', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, marginLeft: 8 },

  userItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  userItemDisabled: { backgroundColor: '#F3F4F6', opacity: 0.85 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  userEmail: { fontSize: 14, color: '#6B7280' },
  userSchool: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  inRoomTag: { fontSize: 14, fontWeight: 'normal', color: '#6B7280' },

  emptyText: { textAlign: 'center', marginTop: 30, color: '#9CA3AF' },
  confirmButton: { backgroundColor: '#10B981', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20, marginBottom: 10 },
  confirmButtonDisabled: { backgroundColor: '#A7F3D0' },
  confirmButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});

export default AddGroupMemberScreen;