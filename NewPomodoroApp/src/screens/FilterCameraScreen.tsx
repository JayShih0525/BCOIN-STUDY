// src/screens/FilterCameraScreen.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  Image, 
  Dimensions, 
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Platform
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
  PhotoFile
} from 'react-native-vision-camera';

// 引入相簿套件
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

const { width } = Dimensions.get('window');

type FilterCameraRouteProp = RouteProp<RootStackParamList, 'FilterCamera'>;

export const FilterCameraScreen: React.FC = () => {
  const route = useRoute<FilterCameraRouteProp>();
  const camera = useRef<Camera>(null);
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');

  // 濾鏡 ID
  const filterId = route.params?.filterId ?? 'filter_cat';

  const devices = useCameraDevices();
  const device = devices.find((d) => d.position === cameraPosition);
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    (async () => {
      await requestPermission();
    })();
  }, [requestPermission]);

  const handleSwitchCamera = useCallback(() => {
    setCameraPosition((p) => (p === 'front' ? 'back' : 'front'));
  }, []);

  // --- 重點更新：拍照並存檔 ---
  const handleTakePhoto = useCallback(async () => {
    try {
      if (camera.current) {
        // 1. 拍照 (存到暫存區)
        const photo: PhotoFile = await camera.current.takePhoto({
          flash: 'off',
        });

        // 2. 存到系統相簿
        // 注意：Android 的 path 通常是 'file:///...'，iOS 有時需要手動加 'file://'
        const filePath = Platform.OS === 'android' ? photo.path : `file://${photo.path}`;
        
        await CameraRoll.saveAsset(filePath, { type: 'photo' });

        Alert.alert('儲存成功', '照片已存入您的相簿！');
        console.log('Saved to camera roll:', filePath);
      }
    } catch (e) {
      console.error('Failed to take photo or save:', e);
      Alert.alert('錯誤', '儲存照片失敗，請檢查相簿權限。');
    }
  }, []);

  if (!device || !hasPermission) {
    // 省略 loading/permission UI 程式碼以節省篇幅 (同上一個版本)
    return <View style={styles.loadingContainer}><ActivityIndicator /></View>;
  }

  return (
    <View style={styles.mainContainer}>
      <View style={styles.headerSpacer} />

      <View style={styles.cameraWrapper}>
        <View style={styles.cameraBox}>
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            photo={true}
          />

          {/* --- 修改點：移除了 cameraPosition === 'front' 的判斷 --- */}
          {/* 現在不管前後鏡頭，只要有 filterId 就會顯示圖片 */}
          {(filterId === 'filter_cat' || filterId === 'cat') && (
            <Image
              source={require('../../assets/filters/cat_ears.png')}
              style={styles.overlay}
              resizeMode="contain"
            />
          )}

          {(filterId === 'filter_dog' || filterId === 'dog') && (
            <Image
              source={require('../../assets/filters/dog_ears.png')}
              style={styles.overlay}
              resizeMode="contain"
            />
          )}
        </View>
      </View>

      <View style={styles.controlsContainer}>
        <View style={styles.controlItem} />
        
        <TouchableOpacity 
          style={styles.captureButtonOuter} 
          onPress={handleTakePhoto}
          activeOpacity={0.7}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlItem} 
          onPress={handleSwitchCamera}
        >
          <View style={styles.flipButton}>
            <Text style={styles.flipText}>↻</Text>
          </View>
          <Text style={styles.controlLabel}>翻轉</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // ... 樣式同上一個版本，保持不變 ...
  mainContainer: { flex: 1, backgroundColor: '#000' },
  headerSpacer: { height: 40 },
  cameraWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraBox: {
    width: width,
    aspectRatio: 3 / 4,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
    borderRadius: 24, // 稍微圓角比較好看
  },
  overlay: {
    position: 'absolute',
    width: '90%',
    height: '45%',
    top: '12%',
    alignSelf: 'center',
    opacity: 0.9,
  },
  controlsContainer: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingBottom: 20,
  },
  controlItem: { width: 60, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { color: '#FFF', fontSize: 12, marginTop: 4 },
  captureButtonOuter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  captureButtonInner: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF',
  },
  flipButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  flipText: { fontSize: 24, color: '#FFF', fontWeight: 'bold', marginTop: -2 },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }
});

export default FilterCameraScreen;