// src/screens/FilterCameraScreen.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  Dimensions, 
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
  ActivityIndicator
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
  PhotoFile
} from 'react-native-vision-camera';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ViewShot from 'react-native-view-shot';

const { width } = Dimensions.get('window');

type FilterCameraRouteProp = RouteProp<RootStackParamList, 'FilterCamera'>;

export const FilterCameraScreen: React.FC = () => {
  // ... (前面的 Hooks, refs, states 保持不變) ...
  const route = useRoute<FilterCameraRouteProp>();
  const viewShotRef = useRef<ViewShot>(null);
  const cameraRef = useRef<Camera>(null);
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');
  const [tempImagePath, setTempImagePath] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const filterId = route.params?.filterId ?? 'filter_cat';
  const devices = useCameraDevices();
  const device = devices.find((d) => d.position === cameraPosition);
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    (async () => { await requestPermission(); })();
  }, [requestPermission]);

  const handleSwitchCamera = useCallback(() => {
    setCameraPosition((p) => (p === 'front' ? 'back' : 'front'));
  }, []);

  const handleOpenGallery = useCallback(async () => {
     // ... (保持不變) ...
     const galleryUrl = Platform.select({ ios: 'photos-redirect://', android: 'content://media/internal/images/media', default: '' });
     try { await Linking.openURL(galleryUrl); } catch (error) { Alert.alert('提示', '請手動打開您的相簿 App。'); }
  }, []);


  // --- handleTakePhoto 保持不變，但為了完整性貼在這裡 ---
  const handleTakePhoto = useCallback(async () => {
    const camera = cameraRef.current;
    const viewShot = viewShotRef.current;
    if (!camera || !viewShot || isProcessing) return;
    setIsProcessing(true);
    try {
      const photo: PhotoFile = await camera.takePhoto({ flash: 'off', enableShutterSound: false });
      const path = Platform.OS === 'android' ? `file://${photo.path}` : photo.path;
      setTempImagePath(path);

      // 等待渲染
      setTimeout(async () => {
        try {
          const combinedUri = await viewShot.capture({ format: "jpg", quality: 0.9, result: "tmpfile" });
          await CameraRoll.saveAsset(combinedUri, { type: 'photo' });
          Alert.alert('成功', '照片已儲存到相簿！');
        } catch (captureError) {
          console.error('截圖失敗:', captureError);
        } finally {
          setTempImagePath(null);
          setIsProcessing(false);
        }
      }, 200); // 稍微增加一點等待時間到 200ms 以確保 Android 渲染完成

    } catch (e) {
      console.error('拍照失敗:', e);
      setIsProcessing(false);
      setTempImagePath(null);
    }
  }, [isProcessing]);

  if (!device || !hasPermission) {
    return <View style={styles.loadingContainer}><ActivityIndicator /></View>;
  }

  return (
    <View style={styles.mainContainer}>
      <View style={styles.headerSpacer} />

      <View style={styles.cameraWrapper}>
        {/* ViewShot 開始 */}
        <ViewShot
          ref={viewShotRef}
          style={styles.cameraBox}
          options={{ format: 'jpg', quality: 0.9 }}
        >
          {tempImagePath ? (
            // --- 修正 2: 顏色問題 ---
            // 用一個純黑背景的 View 包住靜態圖片。
            // 這能強制底層圖形為不透明，解決 Android 截圖顏色跑掉的問題。
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
               <Image 
                 source={{ uri: tempImagePath }} 
                 style={StyleSheet.absoluteFill} 
                 resizeMode="cover"
               />
            </View>
          ) : (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={!tempImagePath} // 當顯示靜態圖時，暫停相機預覽以節省資源
              photo={true}
            />
          )}

          {/* 濾鏡層 */}
          {(filterId === 'filter_cat' || filterId === 'cat') && (
            <Image source={require('../../assets/filters/cat_ears.png')} style={styles.overlay} resizeMode="contain" />
          )}
          {(filterId === 'filter_dog' || filterId === 'dog') && (
            <Image source={require('../../assets/filters/dog_ears.png')} style={styles.overlay} resizeMode="contain" />
          )}
        
        {/* ViewShot 結束 */}
        </ViewShot>

        {/* --- 修正 1: Loading 圖案位置 ---
          移到 ViewShot 外面，但仍在 cameraWrapper 裡面。
          這樣它會蓋在畫面上，但不會被截圖拍進去。
        */}
        {isProcessing && (
            <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#FFF" />
            </View>
        )}
      </View>

      {/* 底部控制列 (保持不變) */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.controlItem} onPress={handleOpenGallery}>
          <View style={styles.galleryIconPlaceholder}>
            <View style={[styles.galleryIconInner, { opacity: 0.6, top: -4, left: 4 }]} />
            <View style={styles.galleryIconInner} />
          </View>
          <Text style={styles.controlLabel}>相簿</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.captureButtonOuter, isProcessing && { opacity: 0.5 }]}
          onPress={handleTakePhoto}
          activeOpacity={0.7}
          disabled={isProcessing}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlItem} onPress={handleSwitchCamera} disabled={isProcessing}>
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
  // ... (其他樣式保持不變) ...
  mainContainer: { flex: 1, backgroundColor: '#000' },
  headerSpacer: { height: 40 },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  cameraWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }, // 確保 wrapper 是 relative 定位
  cameraBox: {
    width: width,
    aspectRatio: 3 / 4,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
    borderRadius: 24,
    // position: 'relative', // 這個可以拿掉，因為外面的 wrapper 已經有了
  },
  overlay: {
    position: 'absolute',
    width: '90%',
    height: '45%',
    top: '12%',
    alignSelf: 'center',
    opacity: 0.9,
    zIndex: 10,
  },
  // Loading 遮罩的樣式保持不變，但現在它作用在 ViewShot 外面了
  processingOverlay: {
    ...StyleSheet.absoluteFillObject, // 這會填滿 cameraWrapper
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20, // 確保在最上層
    borderRadius: 24, // 配合 cameraBox 的圓角
  },
  // ... (控制列樣式保持不變) ...
  controlsContainer: { height: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingBottom: 20 },
  controlItem: { width: 60, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { color: '#FFF', fontSize: 12, marginTop: 4 },
  captureButtonOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  captureButtonInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' },
  flipButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  flipText: { fontSize: 24, color: '#FFF', fontWeight: 'bold', marginTop: -2 },
  galleryIconPlaceholder: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  galleryIconInner: { position: 'absolute', width: 32, height: 32, backgroundColor: '#EEE', borderRadius: 4, borderWidth: 1, borderColor: '#888' }
});

export default FilterCameraScreen;