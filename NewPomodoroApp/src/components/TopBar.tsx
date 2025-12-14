// src/components/TopBar.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
// 引入 Ionicons 來顯示好看的聊天圖示 (如果你的專案還沒設定好 icon，可以用 Emoji 暫代)
import Ionicons from 'react-native-vector-icons/Ionicons'; 
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../constants/theme';
import { useNavigation } from '@react-navigation/native';

interface TopBarProps {
    coins: number;
    onSettingsPress?: () => void;
    // ★ 新增：聊天按鈕點擊事件
    onChatPress?: () => void;
    // ★ 新增：未讀訊息總數
    unreadCount?: number;
}

export const TopBar: React.FC<TopBarProps> = ({ 
    coins = 0, 
    onSettingsPress, 
    onChatPress, 
    unreadCount = 0 
}) => {
    // 3. 在組件內部取得 navigation
    const navigation = useNavigation<any>();

    // 4. 定義點擊處理函式
    const handleChatPress = () => {
        if (onChatPress) {
            // 如果外部有傳入自定義行為，就執行外部的
            onChatPress();
        } else {
            // 如果沒傳，預設跳轉到 ChatList
            navigation.navigate('ChatList');
        }
    };

    return (
        <View style={styles.topBar}>
            {/* ★ 左側：聊天按鈕 */}
            <TouchableOpacity 
                style={styles.chatButton} 
                onPress={handleChatPress}
            >
                {/* 使用 Icon */}
                <Ionicons name="chatbubbles-outline" size={24} color={COLORS.black} />
                
                {/* ★ 未讀訊息紅點 (Badge) */}
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>

            {/* 中間佔位 (將右側內容推到底) */}
            <View style={{ flex: 1 }} />

            {/* 右側：金幣與設定 */}
            <View style={styles.topRight}>
                <View style={styles.coinContainer}>
                    <Text style={styles.coinText}>B {coins}</Text>
                </View>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={onSettingsPress}
                >
                    <Text style={styles.settingsIcon}>🔚</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.sm,
        paddingBottom: SPACING.sm,
        width: '100%',
        backgroundColor: 'transparent', // 確保背景透明或符合你的設計
    },
    // --- 新增樣式 ---
    chatButton: {
        backgroundColor: COLORS.secondary,
        width: 40,
        height: 40,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.sm, // 與中間內容保持一點距離
        position: 'relative', // 為了讓 Badge 絕對定位
    },
    badge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: 'red',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#FFF', // 讓紅點有點白邊，比較好看
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    // ----------------
    topRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    coinContainer: {
        backgroundColor: COLORS.secondary,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.xs,
        borderRadius: BORDER_RADIUS.sm,
    },
    coinText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.black,
    },
    settingsButton: {
        backgroundColor: COLORS.secondary,
        width: 40,
        height: 40,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsIcon: {
        fontSize: FONT_SIZES.lg,
    },
});