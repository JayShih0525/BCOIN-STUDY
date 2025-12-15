// src/screens/ShopScreen.tsx

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';

import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useShopItems } from '../hooks/useShopItems';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useUnread } from '../context/UnreadContext';
import { useChatConnectOnFocus } from '../utils/chatClient';
import { getAvatarUrl } from '../utils/avatar';

type ShopNavProp = NativeStackNavigationProp<RootStackParamList>;

// 定義商品類型，用於篩選
type ItemType = 'filter' | 'mouth' | 'eyes' | 'hair' | 'accessory' | 'eyebrows' | 'glasses' | 'background' | 'style' | 'backgroundType';
type FilterType = 'all' | ItemType; // 'all' 是預設選項

// ✅ 前端顯示用（camelCase）
type ShopItem = {
  id: string;
  name: string;
  price: number;
  type: string; // 'filter' | 'mouth' | 'eyes' | ...
  iconUrl?: string | null;
  avatarParams?: Record<string, any> | null; // ⭐ 用來組 DiceBear URL
  description?: string | null;
};

// Calculate card width for a 2-column grid based on screen size
const { width } = Dimensions.get('window');
const GAP = SPACING.md;
const CARD_WIDTH = (width - SPACING.lg * 2 - GAP) / 2;


// 篩選按鈕元件
const TypeFilterButton: React.FC<{
  type: FilterType;
  selected: boolean;
  onSelect: (type: FilterType) => void;
}> = React.memo(({ type, selected, onSelect }) => {
  const displayText = type === 'all' 
    ? '全部商品' 
    : type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <TouchableOpacity
      style={[
        styles.filterButton,
        selected ? styles.filterButtonSelected : null,
      ]}
      onPress={() => onSelect(type)}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterText,
          selected ? styles.filterTextSelected : null,
        ]}
      >
        {displayText}
      </Text>
    </TouchableOpacity>
  );
});


export const ShopScreen: React.FC = () => {
  const { user } = useAuth();
  useChatConnectOnFocus(user?.id);

  const {
    coins,
    removeCoins,
    loading: coinsLoading,
    refresh: refreshCoins,
  } = useCoinsContext();

  const navigation = useNavigation<ShopNavProp>();
  const { unread } = useUnread();

  // ✅ hook 拿到的 raw items（snake_case）
  const {
    items: shopItemsRaw,
    loading: shopLoading,
    refresh: refreshShopItems,
  } = useShopItems();

  // 1️⃣ 過濾器狀態：預設顯示全部
  const [selectedType, setSelectedType] = useState<FilterType>('all');

  // 2️⃣ 已購買 item_id
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [loadingOwned, setLoadingOwned] = useState(false);

  // 3️⃣ 下拉刷新
  const [refreshing, setRefreshing] = useState(false);

  // ⭐ seed 固定（未登入也不會炸）
  const seed = user?.id ?? 'guest';
  
  // ⭐ 基礎角色外觀參數：用於讓預覽圖差異更明顯
  const BASE_AVATAR_PARAMS = useMemo(() => ({
    mouth: 'variant02', // 固定的嘴巴
    eyes: 'variant11',  // 固定的眼睛
    hair: 'long',       // 固定的髮型
  }), []);


  // 所有可用的商品類型選項
  const availableTypes: FilterType[] = useMemo(() => [
    'all',
    'filter',
    'mouth',
    'eyes',
    // 'hair',
    // 'accessory',
    'eyebrows',
    'glasses',
    // 'background',
    // 'style',
    // 'backgroundType',
  ], []);


  // ✅ 統一 camelCase
  const displayItems: ShopItem[] = useMemo(() => {
    return (shopItemsRaw ?? []).map((it: any) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      type: it.type,
      iconUrl: it.icon_url ?? null,
      avatarParams: it.avatar_params ?? null,
      description: it.description ?? null,
    }));
  }, [shopItemsRaw]);

  // 4️⃣ 根據選擇的 type 進行過濾
  const filteredItems = useMemo(() => {
    if (selectedType === 'all') {
      return displayItems;
    }
    return displayItems.filter(item => item.type === selectedType);
  }, [displayItems, selectedType]);


  // 讀取已購買清單
  const fetchOwned = useCallback(async () => {
    if (!user) {
      setOwnedIds([]);
      return;
    }

    setLoadingOwned(true);
    const { data, error } = await supabase
      .from('shop_purchases')
      .select('item_id')
      .eq('user_id', user.id);

    if (error) {
      console.warn('載入已購買商品失敗：', error.message);
      setOwnedIds([]);
    } else {
      setOwnedIds((data ?? []).map((row: any) => row.item_id));
    }
    setLoadingOwned(false);
  }, [user]);

  useEffect(() => {
    void fetchOwned();
  }, [fetchOwned]);

  // 下拉刷新：coins + owned + shopItems
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshCoins?.(),
        fetchOwned(),
        refreshShopItems?.(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCoins, fetchOwned, refreshShopItems]);

  // filter 類型才開啟濾鏡
  const handleUseFilter = (item: ShopItem) => {
    if (!item?.id) {
      Alert.alert('無法使用', '這個商品沒有設定 filterId。');
      return;
    }
    navigation.navigate('FilterCamera', { filterId: item.id });
  };

  // 購買
  const handleBuyItem = useCallback(
    async (item: ShopItem) => {
      if (!user) {
        Alert.alert('請先登入', '登入後才可以購買商品喔！');
        return;
      }

      if (ownedIds.includes(item.id)) {
        Alert.alert('提醒', '你已經擁有這個商品了，可以直接使用。');
        return;
      }

      if (coins < item.price) {
        Alert.alert('B 幣不足', `這個商品需要 ${item.price} B，目前只有 ${coins} B`);
        return;
      }

      Alert.alert(
        '確認購買',
        `確定要花 ${item.price} B 購買「${item.name}」嗎？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '購買',
            onPress: async () => {
              try {
                // 先扣本地 B 幣（useCoins 會同步到 DB）
                removeCoins(item.price);

                // 寫入購買紀錄（避免重複：unique(user_id, item_id)）
                const { error } = await supabase.from('shop_purchases').upsert(
                  { user_id: user.id, item_id: item.id },
                  { onConflict: 'user_id,item_id' }
                );

                if (error) {
                  console.warn('寫入 shop_purchases 失敗：', error.message);
                  Alert.alert('錯誤', '購買紀錄儲存失敗，但 B 幣已扣除，請稍後再試。');
                  return;
                }

                setOwnedIds((prev) => [...prev, item.id]);
                Alert.alert('購買成功', `已購買「${item.name}」 🎉`);
              } catch (e) {
                console.warn('handleBuyItem error', e);
                Alert.alert('錯誤', '購買過程發生問題，請再試一次。');
              }
            },
          },
        ]
      );
    },
    [user, coins, ownedIds, removeCoins]
  );

  const isLoading = coinsLoading || shopLoading || loadingOwned;

  return (
    <ScreenContainer>
      <TopBar coins={coins} unreadCount={unread.total} />

      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Store</Text>
          <Text style={styles.headerSubtitle}>購買濾鏡與頭像配件，讓你的專注更有趣！</Text>
        </View>
        
        {/* ⭐ 篩選器容器 (確保高度固定) */}
        <View style={styles.filterListContainer}>
          <FlatList
            data={availableTypes}
            keyExtractor={(item) => item}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterList}
            contentContainerStyle={styles.filterListContent}
            renderItem={({ item }) => (
              <TypeFilterButton
                type={item}
                selected={selectedType === item}
                onSelect={setSelectedType}
              />
            )}
          />
        </View>
        {/* ⭐ 篩選器容器結束 */}

        {isLoading && !refreshing && (
          <View style={{ alignItems: 'center', marginBottom: SPACING.md }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 4, fontSize: FONT_SIZES.xs }}>載入中…</Text>
          </View>
        )}

        <FlatList
          data={filteredItems} 
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item }) => {
            const owned = ownedIds.includes(item.id);

            // ⭐ 預覽圖生成邏輯：合併基礎參數
            const displayImageUrl =
              item.type === 'filter'
                ? (item.iconUrl ?? undefined)
                : getAvatarUrl(
                    seed,
                    'adventurer-neutral',
                    {
                      ...BASE_AVATAR_PARAMS,
                      ...(item.avatarParams || {}),
                    }
                  );
            // ⭐ 邏輯結束

            return (
              <View style={styles.card}>
                <View style={styles.cardImagePlaceholder}>
                  {displayImageUrl ? (
                    <Image
                      source={{ uri: displayImageUrl }}
                      style={{ width: 60, height: 60, borderRadius: 30 }}
                    />
                  ) : (
                    <Text style={styles.placeholderText}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemType}>
                    {String(item.type).toUpperCase()} · {item.price} B
                  </Text>
                </View>

                {owned ? (
                  item.type === 'filter' ? (
                    <TouchableOpacity
                      style={styles.useButton}
                      onPress={() => handleUseFilter(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.useText}>Use Filter</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.disabledPlaceholder}>
                      <Text style={styles.disabledText}>已購買</Text>
                    </View>
                  )
                ) : (
                  <TouchableOpacity
                    style={styles.buyButton}
                    onPress={() => handleBuyItem(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.buyText}>購買 {item.price} B</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            !isLoading && filteredItems.length === 0 ? (
              <Text style={{ textAlign: 'center', marginTop: 16, fontSize: FONT_SIZES.sm, color: '#6B7280' }}>
                目前沒有符合篩選條件的商品
              </Text>
            ) : null
          }
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  headerContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: '#888',
    marginTop: 4,
  },
  // --- 修正後的篩選器樣式 (確保高度固定) ---
  filterListContainer: { // 新增的容器，控制垂直間距
    marginBottom: SPACING.sm, 
    paddingVertical: SPACING.sm / 2, // 確保上下的最小間距
  },
  filterList: {
    // FlatList 本身不需要垂直 padding
  },
  filterListContent: {
    paddingHorizontal: SPACING.lg,
    alignItems: 'center', // 確保內容垂直置中
    minHeight: 38, 
  },
  filterButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm / 2, // 固定按鈕內部 padding
    marginRight: SPACING.sm,
    borderRadius: 20,
    backgroundColor: '#E5E7EB', 
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButtonSelected: {
    backgroundColor: COLORS.secondary, 
    borderColor: COLORS.secondary,
  },
  filterText: {
    fontSize: FONT_SIZES.sm,
    color: '#4B5563', 
    fontWeight: FONT_WEIGHTS.semibold,
  },
  filterTextSelected: {
    color: '#FFFFFF', 
  },
  // ------------------------------------
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
  },
  cardImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.secondary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  cardBody: {
    alignItems: 'center',
    marginBottom: SPACING.md,
    width: '100%',
  },
  itemName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
    textAlign: 'center',
  },
  itemType: {
    fontSize: FONT_SIZES.xs,
    color: '#AAAAAA',
    textTransform: 'uppercase',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  useButton: {
    width: '100%',
    paddingVertical: 10,
    backgroundColor: COLORS.secondary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useText: {
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: FONT_SIZES.sm,
  },
  buyButton: {
    width: '100%',
    paddingVertical: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyText: {
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: FONT_SIZES.sm,
  },
  disabledPlaceholder: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  disabledText: {
    color: '#4B5563',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});