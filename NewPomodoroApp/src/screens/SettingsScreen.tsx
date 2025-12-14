import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';

import { ScreenContainer } from '../components';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { getAvatarUrl } from '../utils/avatar';

// ★ 修正點 1: 引入 RNFS 和 Base64 Decoder
import { decode } from 'base-64'; 


// ------------------------------
// Types
// ------------------------------
interface UserProfile {
  user_id: string;
  school_code: string | null;
  school_name: string | null;
  allow_chat: boolean;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

// ------------------------------
// Component
// ------------------------------
export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 可編輯的 State
  const [displayName, setDisplayName] = useState('');
  const [allowChat, setAllowChat] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState('');

  // ------------------------------
  // 1) Fetch Profile Data
  // ------------------------------
  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const profileData = data as UserProfile;
        setProfile(profileData);
        
        // 初始化可編輯的 State
        setDisplayName(profileData.display_name || '');
        setAllowChat(profileData.allow_chat);
        setAvatarUrl(profileData.avatar_url || getAvatarUrl(user.id));
      } else {
        // 如果找不到 profile，使用預設值
        setProfile({
          user_id: user.id,
          email: user.email,
          school_code: null,
          school_name: null,
          allow_chat: true,
          display_name: user.email?.split('@')[0] || '匿名用戶',
          avatar_url: getAvatarUrl(user.id),
        } as UserProfile);
      }
    } catch (e: any) {
      console.error('Error fetching profile:', e);
      Alert.alert('錯誤', `無法載入用戶資料: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ------------------------------
  // 2) Avatar Upload (與 ChatScreen 統一邏輯)
  // ------------------------------
  const handleAvatarUpload = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.7,
      selectionLimit: 1,
      includeBase64: true, 
    });

    if (!user?.id || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];
    const base64 = asset.base64;
    const mimeType = asset.type || 'image/jpeg';

    if (!base64) {
      Alert.alert('選取失敗', '無法取得圖片內容（base64 為空）。請改用另一張或檢查權限。');
      return;
    }

    setIsSaving(true);
    try {
      // base64 -> ArrayBuffer
      const binaryString = decode(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

      const ext =
        mimeType.includes('png') ? 'png' :
        mimeType.includes('webp') ? 'webp' :
        'jpg';

      const fileName = `avatars/${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('public_avatars')
        .upload(fileName, bytes.buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('public_avatars').getPublicUrl(fileName);

      if (!data?.publicUrl) {
        throw new Error('無法取得公開圖片網址');
      }

      setAvatarUrl(data.publicUrl);
      Alert.alert('上傳成功', '新頭像已設定。請點擊儲存按鈕保存變更。');
    } catch (e: any) {
      console.error('Avatar upload failed:', e);
      Alert.alert('上傳失敗', e?.message || '無法上傳頭像。');
    } finally {
      setIsSaving(false);
    }
  };
  
  // ------------------------------
  // 3) Revert to Default Avatar
  // ------------------------------
  const handleRevertDefaultAvatar = () => {
      if (!user?.id) return;
      // 重設為 Dicebear/預設 URL
      const defaultUrl = getAvatarUrl(user.id);
      setAvatarUrl(defaultUrl);
      Alert.alert('提示', '頭像已重設為預設。請點擊儲存按鈕保存變更。');
  };


  // ------------------------------
  // 4) Save Profile Changes
  // ------------------------------
  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);

    try {
      const isDefaultAvatar = avatarUrl === getAvatarUrl(user.id);

      const updates = {
        user_id: user.id,
        allow_chat: allowChat,
        display_name: displayName.trim() || null,
        // 如果頭像 URL 是預設的 Dicebear URL (即用戶點擊了返回預設)，則將 DB 設為 NULL
        avatar_url: isDefaultAvatar ? null : avatarUrl, 
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', user.id)
        .select('*'); 

      if (error) throw error;

      Alert.alert('成功', '用戶資料已更新！');
      // 重新獲取資料以確保 Profile State 最新
      await fetchProfile(); 
      
    } catch (e: any) {
      console.error('Save failed:', e);
      Alert.alert('儲存失敗', `無法保存變更: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------
  // UI Render Helpers
  // ------------------------------
  const renderProfileField = (label: string, value: string | boolean | null, editable: boolean = false, type: 'text' | 'switch' | 'url' = 'text') => {
    const displayValue = (typeof value === 'boolean' ? (value ? '是' : '否') : (value || '未設定'));
    
    if (type === 'switch') {
        return (
            <View style={[styles.row, styles.switchRow]}>
                <Text style={styles.label}>{label}</Text>
                <Switch
                    trackColor={{ false: '#767577', true: COLORS.primary }}
                    thumbColor={allowChat ? COLORS.secondary : '#f4f3f4'}
                    ios_backgroundColor="#3e3e3e"
                    onValueChange={setAllowChat}
                    value={allowChat}
                    disabled={!editable}
                />
            </View>
        );
    }

    if (editable && type === 'text') {
      return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={label}
                placeholderTextColor="#9CA3AF"
            />
        </View>
      );
    }
    
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>{displayValue}</Text>
      </View>
    );
  };
  
  const renderAvatarSection = () => (
      <View style={styles.avatarSection}>
          <Text style={styles.sectionTitle}>頭像設定</Text>
          <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
          />
          <View style={styles.avatarButtons}>
              <TouchableOpacity 
                  style={[styles.avatarBtn, { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                  onPress={handleAvatarUpload}
                  disabled={isSaving}
              >
                  <Ionicons name="cloud-upload-outline" size={20} color="#FFF" />
                  <Text style={[styles.avatarBtnText, { color: '#FFF' }]}>上傳新頭像</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                  style={styles.avatarBtn}
                  onPress={handleRevertDefaultAvatar}
                  disabled={isSaving}
              >
                  <Ionicons name="refresh-outline" size={20} color={COLORS.black} />
                  <Text style={[styles.avatarBtnText, { color: COLORS.black }]}>返回預設</Text>
              </TouchableOpacity>
          </View>
      </View>
  );

  if (loading) {
    // ★ 修正點 2: 使用 Skeleton 佔位圖替代全螢幕載入
    return (
        <ScreenContainer>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color={COLORS.black} />
                </TouchableOpacity>
                <Text style={styles.pageTitle}>設定與個人資料</Text>
                <View style={[styles.saveButton, styles.skeletonBg, { width: 60 }]} />
            </View>

            <ScrollView contentContainerStyle={styles.container}>
                {/* 1. Avatar 佔位區 */}
                <View style={[styles.avatarSection, styles.skeletonBg]}>
                    <View style={[styles.skeletonAvatar]} />
                    <View style={[styles.skeletonLine, { width: 120, height: 20, marginBottom: 15 }]} />
                    <View style={styles.avatarButtons}>
                        <View style={[styles.skeletonBtn, { flex: 1, marginHorizontal: SPACING.xs }]} />
                        <View style={[styles.skeletonBtn, { flex: 1, marginHorizontal: SPACING.xs }]} />
                    </View>
                </View>

                {/* 2. 基本資料佔位區 */}
                <View style={[styles.skeletonLine, { width: 150, marginTop: SPACING.lg, marginBottom: SPACING.md }]} />

                <View style={styles.row}>
                    <View style={[styles.skeletonLine, { width: '30%', backgroundColor: '#D1D5DB' }]} />
                    <View style={[styles.skeletonLine, { width: '40%', height: 28 }]} />
                </View>
                <View style={styles.row}>
                    <View style={[styles.skeletonLine, { width: '30%', backgroundColor: '#D1D5DB' }]} />
                    <View style={[styles.skeletonLine, { width: '40%', height: 28 }]} />
                </View>
                
                {/* 3. 帳號資訊佔位區 */}
                <View style={[styles.skeletonLine, { width: 150, marginTop: SPACING.lg, marginBottom: SPACING.md }]} />

                <View style={styles.row}>
                    <View style={[styles.skeletonLine, { width: '30%', backgroundColor: '#D1D5DB' }]} />
                    <View style={[styles.skeletonLine, { width: '50%' }]} />
                </View>
                <View style={styles.row}>
                    <View style={[styles.skeletonLine, { width: '30%', backgroundColor: '#D1D5DB' }]} />
                    <View style={[styles.skeletonLine, { width: '50%' }]} />
                </View>
                <View style={styles.row}>
                    <View style={[styles.skeletonLine, { width: '30%', backgroundColor: '#D1D5DB' }]} />
                    <View style={[styles.skeletonLine, { width: '50%' }]} />
                </View>
                <View style={styles.row}>
                    <View style={[styles.skeletonLine, { width: '30%', backgroundColor: '#D1D5DB' }]} />
                    <View style={[styles.skeletonLine, { width: '50%' }]} />
                </View>
                
                {/* 載入指示器放在底部提醒數據仍在獲取 */}
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 20 }} />
            </ScrollView>
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
        <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>儲存</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        
        {/* 1. 頭像設定 */}
        {renderAvatarSection()}

        <Text style={styles.sectionTitle}>基本資料</Text>
        
        {/* 2. 可編輯欄位 */}
        {renderProfileField('顯示名稱', displayName, true, 'text')}
        {renderProfileField('允許聊天', allowChat, true, 'switch')}

        <Text style={styles.sectionTitle}>帳號資訊</Text>

        {/* 3. 唯讀欄位 */}
        {renderProfileField('Email', profile?.email || user?.email || '', false)}
        {renderProfileField('學校名稱', profile?.school_name, false)}
        {renderProfileField('學校代碼', profile?.school_code, false)}
        {renderProfileField('用戶 ID', profile?.user_id, false)}
        
        <TouchableOpacity 
            style={styles.signOutButtonWrapper} // 新增一個 Wrapper 實現居中
            onPress={signOut} 
            disabled={isSaving}
        >
            <View style={styles.signOutButton}>
                <Ionicons name="log-out-outline" size={24} color="#FFF" />
                <Text style={styles.signOutButtonText}>登出帳號</Text>
            </View>
        </TouchableOpacity>

      </ScrollView>
    </ScreenContainer>
  );
};

// ------------------------------
// Styles
// ------------------------------
const styles = StyleSheet.create({
  // ★ 移除 loadingContainer 中的 flex: 1 避免佔滿整個螢幕
  loadingContainer: { 
      // flex: 1, // 移除這個 flex 屬性
      justifyContent: 'center', 
      alignItems: 'center', 
      backgroundColor: '#FFF' 
  },
  loadingText: { 
      marginTop: SPACING.md, 
      color: COLORS.gray 
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFF',
  },
  backButton: {
    padding: 5,
    borderRadius: 24,
  },
  pageTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: FONT_SIZES.md,
  },
  
  container: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 50,
    backgroundColor: '#F9FAFB',
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#374151',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  // ★ 樣式修正：針對 Switch 調整 Padding
  switchRow: {
    paddingVertical: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZES.md,
    color: '#6B7280',
    fontWeight: '500',
    width: '35%',
  },
  value: {
    fontSize: FONT_SIZES.md,
    color: COLORS.black,
    flex: 1,
    textAlign: 'right',
  },
  input: {
    flex: 1,
    // 移除 borderWidth 和 borderColor，讓它看起來更像一個值，而不是輸入框
    borderWidth: 0, 
    borderColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: FONT_SIZES.md,
    textAlign: 'right',
    marginLeft: SPACING.md,
    color: COLORS.black,
  },
  
  // 頭像區塊樣式
  avatarSection: {
      alignItems: 'center',
      paddingVertical: SPACING.md, // 減少垂直填充
      backgroundColor: '#FFF',
      borderRadius: 12,
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.md,
  },
  avatarImage: {
      width: 80, // 略微縮小
      height: 80,
      borderRadius: 40,
      marginBottom: SPACING.sm,
      borderWidth: 3,
      borderColor: '#E5E7EB',
      backgroundColor: '#F3F4F6',
  },
  avatarButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      maxWidth: 350, // 略為放寬
      marginTop: SPACING.sm,
      marginBottom: SPACING.sm,
  },
  avatarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#FFF',
      flex: 1,
      marginHorizontal: SPACING.xs,
  },
  avatarBtnText: {
      fontWeight: 'bold',
      marginLeft: 5,
      fontSize: FONT_SIZES.sm,
      color: COLORS.black,
  },
  signOutButtonWrapper: {
    alignItems: 'center', 
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },

  // --- 修正：登出按鈕樣式 ---
  signOutButton: {
    backgroundColor: '#EF4444', 
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg * 2, // 增加水平填充來定義寬度
    borderRadius: 8,
    
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#FFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: FONT_SIZES.md,
    marginLeft: SPACING.sm, // 使用 margin 替代 gap
  },

  // --- 新增 Skeleton 樣式 ---
  skeletonBg: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  skeletonLine: {
      backgroundColor: '#E5E7EB',
      height: 14,
      borderRadius: 4,
  },
  skeletonAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      marginBottom: SPACING.sm,
      backgroundColor: '#D1D5DB',
      borderWidth: 3,
      borderColor: '#E5E7EB',
  },
  skeletonBtn: {
      backgroundColor: '#D1D5DB',
      paddingVertical: 10,
      borderRadius: 8,
      height: 40,
  },
});