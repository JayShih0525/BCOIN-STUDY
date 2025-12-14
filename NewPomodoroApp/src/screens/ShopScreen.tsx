// src/screens/ShopScreen.tsx

import React, { useEffect, useState, useCallback } from 'react';
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
  RefreshControl,        // ⭐ 新增
} from 'react-native';
import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useShopItems } from '../hooks/useShopItems';
import { ShopItem } from '../constants/shop';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useUnread } from '../context/UnreadContext';     // 用來拿未讀數字
import { useChatConnectOnFocus } from '../utils/chatClient';

type ShopNavProp = NativeStackNavigationProp<RootStackParamList>;

// Calculate card width for a 2-column grid based on screen size
const { width } = Dimensions.get('window');
const GAP = SPACING.md;
const CARD_WIDTH = (width - SPACING.lg * 2 - GAP) / 2;

export const ShopScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  useChatConnectOnFocus(user?.id);
  
  const {
    coins,
    removeCoins,
    loading: coinsLoading,
    refresh: refreshCoins,
  } = useCoinsContext();

  const navigation = useNavigation<ShopNavProp>();

  const { unread } = useUnread();

  // 1️⃣ 資料庫商品列表（透過 hook）
  const { items: shopItems, loading: shopLoading } = useShopItems();

  // 2️⃣ 目前使用者已經買過的 item_id
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [loadingOwned, setLoadingOwned] = useState(false);

  // 3️⃣ 下拉刷新狀態
  const [refreshing, setRefreshing] = useState(false);

  // 把「載入已購買清單」抽成一個 function，之後下拉也可以呼叫
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
      setOwnedIds((data ?? []).map(row => row.item_id));
    }
    setLoadingOwned(false);
  }, [user]);

  // 初次進入畫面時載入已購買清單（只跑一次）
  useEffect(() => {
    void fetchOwned();
  }, [fetchOwned]);

  // 下拉時要做的事：重抓 coins + owned
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshCoins?.(), // 如果 useCoins 有給 refresh
        fetchOwned(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCoins, fetchOwned]);

  // 開啟濾鏡（只有已購買的才能走到這裡）
  const handleUseFilter = (item: ShopItem) => {
    if (!item.filterId) {
      Alert.alert('無法使用', '這個商品沒有設定 filterId。');
      return;
    }
    navigation.navigate('FilterCamera', { filterId: item.filterId });
  };

  // 按下「購買」按鈕
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
        Alert.alert(
          'B 幣不足',
          `這個商品需要 ${item.price} B，目前只有 ${coins} B`
        );
        return;
      }

      Alert.alert(
        '確認購買',
        `確定要花 ${item.price} B 購買「${item.name}」嗎？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '購買',
            style: 'default',
            onPress: async () => {
              try {
                // 先扣本地 B 幣（useCoins 會同步到 DB）
                removeCoins(item.price);

                // 寫入購買紀錄（避免重複：用 user_id + item_id 當 unique）
                const { error } = await supabase.from('shop_purchases').upsert(
                  {
                    user_id: user.id,
                    item_id: item.id,
                  },
                  {
                    onConflict: 'user_id,item_id',
                  }
                );

                if (error) {
                  console.warn('寫入 shop_purchases 失敗：', error.message);
                  Alert.alert('錯誤', '購買紀錄儲存失敗，但 B 幣已扣除，請稍後再試。');
                  return;
                }

                // 更新本地 ownedIds
                setOwnedIds(prev => [...prev, item.id]);

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
      <TopBar 
        coins={coins} 
        unreadCount={unread.total}
      />

      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Store</Text>
          <Text style={styles.headerSubtitle}>
            購買濾鏡與主題，讓你的專注更有趣！
          </Text>
        </View>

        {isLoading && !refreshing && (
          <View style={{ alignItems: 'center', marginBottom: SPACING.md }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 4, fontSize: FONT_SIZES.xs }}>
              載入中…
            </Text>
          </View>
        )}

        <FlatList
          data={shopItems}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          // ⭐ 加上下拉更新
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
          renderItem={({ item }) => {
            const owned = ownedIds.includes(item.id);

            return (
              <View style={styles.card}>
                {/* 圖示：若 DB 有 icon_url 就顯示圖片，沒有就顯示 emoji 或首字母 */}
                <View style={styles.cardImagePlaceholder}>
                  {item.iconUrl ? (
                    <Image
                      source={{ uri: item.iconUrl }}
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
                    {item.type.toUpperCase()} · {item.price} B
                  </Text>
                </View>

                {/* 底部按鈕：依 owned 決定行為 */}
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
            !isLoading ? (
              <Text
                style={{
                  textAlign: 'center',
                  marginTop: 16,
                  fontSize: FONT_SIZES.sm,
                }}
              >
                目前沒有可購買的商品
              </Text>
            ) : null
          }
        />
      </View>
    </ScreenContainer>
  );
};

// （styles 保持原本那段就好）

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