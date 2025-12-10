// src/screens/FilterCameraScreen.tsx

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { ScreenContainer } from '../components';
import { RootStackParamList } from '../types/navigation';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
} from 'react-native-vision-camera';

type FilterCameraRouteProp = RouteProp<RootStackParamList, 'FilterCamera'>;

export const FilterCameraScreen: React.FC = () => {
  const route = useRoute<FilterCameraRouteProp>();

  // 從路由拿到 filterId，預設用貓耳朵
  const filterId = route.params?.filterId ?? 'filter_cat';

  // 取得可用鏡頭（只抓前鏡頭）
  const devices = useCameraDevices();
  const device = devices.find((d) => d.position === 'front'); // 先用前鏡頭

  // 相機權限
  const { hasPermission, requestPermission } = useCameraPermission();

  // 一進畫面就請求權限
  useEffect(() => {
    (async () => {
      await requestPermission();
    })();
  }, [requestPermission]);

  // 1️⃣ 還沒拿到裝置時 → 簡單 loading
  if (!device) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>載入相機裝置中…</Text>
        </View>
      </ScreenContainer>
    );
  }

  // 2️⃣ 沒有權限 → 顯示提示，而不是一直 loading
  if (!hasPermission) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ textAlign: 'center', marginBottom: 8 }}>
            尚未授權使用相機
          </Text>
          <Text style={{ textAlign: 'center', fontSize: 12, opacity: 0.7 }}>
            若沒有看到權限視窗，請到 iPhone 設定 &gt; 隱私權 &gt; 相機，
            開啟此 App 的相機權限。
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // 3️⃣ 有裝置也有權限 → 顯示相機 + 濾鏡
  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.cameraBox}>
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
          />

          {/* 疊耳朵圖：記得 PNG 要有透明背景 */}
          {filterId === 'filter_cat' || filterId === 'cat' && (
            <Image
              source={require('../../assets/filters/cat_ears.png')}
              style={styles.overlay}
              resizeMode="contain"
            />
          )}

          {filterId === 'filter_dog' || filterId === 'dog' && (
            <Image
              source={require('../../assets/filters/dog_ears.png')}
              style={styles.overlay}
              resizeMode="contain"
            />
          )}
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBox: {
    width: '90%',
    aspectRatio: 3 / 4,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    width: '80%',
    height: '40%',
    top: 40,
    alignSelf: 'center',
  },
});

export default FilterCameraScreen;

