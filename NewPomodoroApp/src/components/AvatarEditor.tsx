import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '../lib/supabase';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { decode } from 'base-64';
import { getAvatarUrl } from '../utils/avatar';

type OwnedPart = {
  id: string;
  type: string;
  name: string;
  avatarParams: Record<string, any> | null;
};

type Props = {
  userId: string;

  // 目前草稿（由 SettingsScreen 控制）
  avatarUrl: string | null;
  avatarParams: Record<string, any>; // 一律用 {}，不要用 null（比較好處理）

  ownedParts: OwnedPart[];

  // 回傳給 SettingsScreen：新的 url/params
  onChange: (next: { avatar_url: string; avatar_params: Record<string, any> }) => void;
};

const BASE_PARAMS = { mouth: 'variant02', eyes: 'variant11', hair: 'long' };

export const AvatarEditor: React.FC<Props> = ({
  userId,
  avatarUrl,
  avatarParams,
  ownedParts,
  onChange,
}) => {
  const [uploading, setUploading] = useState(false);

  // 分組：type -> parts[]
  const grouped = useMemo(() => {
    const map: Record<string, OwnedPart[]> = {};
    ownedParts.forEach(p => {
      if (!map[p.type]) map[p.type] = [];
      map[p.type].push(p);
    });
    return map;
  }, [ownedParts]);

  const partTypes = useMemo(() => Object.keys(grouped), [grouped]);

  const buildUrlFromParams = (params: Record<string, any>) => {
    return getAvatarUrl(userId, 'adventurer-neutral', { ...BASE_PARAMS, ...params });
  };

  // ✅ 選一個配件（同類型只能選一個）
  const applyPart = (type: string, part: OwnedPart) => {
    const nextParams = { ...avatarParams };

    // 先清掉這一類型可能用到的 key（這裡用「該 part 的 avatarParams keys」來推）
    // 例如 mouth: variant10，就把 mouth 覆蓋掉
    if (part.avatarParams) {
      Object.keys(part.avatarParams).forEach(k => {
        delete nextParams[k];
      });
    }

    // 再套上新的
    Object.assign(nextParams, part.avatarParams ?? {});

    onChange({
      avatar_params: nextParams,
      avatar_url: buildUrlFromParams(nextParams),
    });
  };

  // ✅ 清掉某一類（例如 mouth 類清空）
  const clearType = (type: string) => {
    const nextParams = { ...avatarParams };

    // 這一類所有商品的 keys 都刪掉
    (grouped[type] ?? []).forEach(p => {
      if (!p.avatarParams) return;
      Object.keys(p.avatarParams).forEach(k => delete nextParams[k]);
    });

    onChange({
      avatar_params: nextParams,
      avatar_url: buildUrlFromParams(nextParams),
    });
  };

  // ✅ 還原（清空所有配件）
  const restoreNoAccessories = () => {
    const empty: Record<string, any> = {};
    onChange({
      avatar_params: empty,
      avatar_url: buildUrlFromParams(empty),
    });
  };

  // ✅ 上傳自訂頭像（只回傳 url，不改 params）
  const handleUploadCustom = async () => {
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
    const ext =
      mimeType.includes('png') ? 'png' :
      mimeType.includes('webp') ? 'webp' : 'jpg';

    setUploading(true);
    try {
      const binary = decode(asset.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const filePath = `avatars/${userId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('public_avatars')
        .upload(filePath, bytes.buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from('public_avatars').getPublicUrl(filePath);
      const publicUrl = data?.publicUrl;

      if (!publicUrl) throw new Error('拿不到 public url');

      // 自訂頭像：params 直接清空（你要的「沒有任何配件」效果）
      onChange({
        avatar_url: publicUrl,
        avatar_params: {},
      });

      Alert.alert('成功', '已選擇自訂頭像（記得按右上角儲存）');
    } catch (e: any) {
      Alert.alert('上傳失敗', e?.message ?? '上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>頭像</Text>

      <View style={styles.previewRow}>
        <Image
          source={{ uri: avatarUrl ?? buildUrlFromParams(avatarParams ?? {}) }}
          style={styles.avatar}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.primary }]} onPress={handleUploadCustom} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#fff" /> : <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
            <Text style={[styles.btnText, { color: '#fff' }]}>上傳自訂頭像</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={restoreNoAccessories} disabled={uploading}>
            <Ionicons name="refresh-outline" size={18} color={COLORS.black} />
            <Text style={[styles.btnText, { color: COLORS.black }]}>還原（清空配件）</Text>
          </TouchableOpacity>
        </View>
      </View>

      {partTypes.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.subTitle}>已購買配件</Text>

          {partTypes.map((type) => (
            <View key={type} style={{ marginTop: 10 }}>
              <View style={styles.typeHeader}>
                <Text style={styles.typeText}>{type.toUpperCase()}</Text>
                <TouchableOpacity onPress={() => clearType(type)}>
                  <Text style={styles.clearText}>清除此類</Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {(grouped[type] ?? []).map((part) => (
                  <TouchableOpacity
                    key={part.id}
                    style={styles.partBox}
                    onPress={() => applyPart(type, part)}
                  >
                    <Image
                      source={{ uri: buildUrlFromParams({ ...avatarParams, ...(part.avatarParams ?? {}) }) }}
                      style={styles.partImg}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#374151',
  },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#F3F4F6' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  btnText: { marginLeft: 8, fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.sm },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typeText: { fontWeight: FONT_WEIGHTS.bold, color: '#111827' },
  clearText: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
  partBox: {
    width: 62,
    height: 62,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginRight: 10,
    backgroundColor: '#fff',
  },
  partImg: { width: '100%', height: '100%' },
});