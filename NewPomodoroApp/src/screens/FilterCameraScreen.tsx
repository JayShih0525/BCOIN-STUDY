// src/screens/FilterCameraScreen.tsx

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
  PhotoFile,
  CameraPosition
} from 'react-native-vision-camera';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ViewShot from 'react-native-view-shot';

const { width } = Dimensions.get('window');
const ASPECT_RATIO = 3 / 4;

type FilterCameraRouteProp = RouteProp<RootStackParamList, 'FilterCamera'>;

// Define filter assets mapping for cleaner code and extensibility
const FILTER_ASSETS: Record<string, any> = {
  filter_cat: require('../../assets/filters/cat_ears.png'),
  cat: require('../../assets/filters/cat_ears.png'),
  filter_dog: require('../../assets/filters/dog_ears.png'),
  dog: require('../../assets/filters/dog_ears.png'),
};

export const FilterCameraScreen: React.FC = () => {
  const route = useRoute<FilterCameraRouteProp>();
  const viewShotRef = useRef<ViewShot>(null);
  const cameraRef = useRef<Camera>(null);
  
  // Camera State
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('front');
  const [tempImagePath, setTempImagePath] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);

  // Params & Devices
  const filterId = route.params?.filterId ?? 'filter_cat';
  const devices = useCameraDevices();
  const device = devices.find((d) => d.position === cameraPosition);
  const { hasPermission, requestPermission } = useCameraPermission();

  // Permission Effect
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // Handlers
  const handleSwitchCamera = useCallback(() => {
    setCameraPosition((p) => (p === 'front' ? 'back' : 'front'));
  }, []);

  const handleOpenGallery = useCallback(async () => {
    const galleryUrl = Platform.select({ 
      ios: 'photos-redirect://', 
      android: 'content://media/internal/images/media', 
      default: '' 
    });
    
    try {
      const canOpen = await Linking.canOpenURL(galleryUrl);
      if (canOpen) {
        await Linking.openURL(galleryUrl);
      } else {
         // Fallback to settings if specific gallery scheme fails
         await Linking.openSettings();
      }
    } catch (error) {
      Alert.alert('提示', '無法自動打開相簿，請手動開啟。');
    }
  }, []);

  const saveCombinedImage = useCallback(async () => {
    const viewShot = viewShotRef.current;
    if (!viewShot) return;

    try {
      // Small delay to ensure render cycle is complete even after onLoad
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const combinedUri = await viewShot.capture({ 
        format: "jpg", 
        quality: 0.9, 
        result: "tmpfile" 
      });

      await CameraRoll.saveAsset(combinedUri, { type: 'photo' });
      Alert.alert('成功', '照片已儲存到相簿！');
    } catch (captureError) {
      console.error('Save failed:', captureError);
      Alert.alert('錯誤', '儲存照片失敗');
    } finally {
      setTempImagePath(null);
      setIsProcessing(false);
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || isProcessing) return;

    setIsProcessing(true);
    try {
      const photo: PhotoFile = await camera.takePhoto({
        flash: 'off',
        enableShutterSound: false 
      });
      
      const path = Platform.OS === 'android' ? `file://${photo.path}` : photo.path;
      setTempImagePath(path);
      // The saving flow continues in the <Image onLoad={...} /> prop
    } catch (e) {
      console.error('Photo capture failed:', e);
      setIsProcessing(false);
      setTempImagePath(null);
      Alert.alert('錯誤', '拍照失敗，請重試。');
    }
  }, [isProcessing]);

  // Loading / No Device State
  if (!hasPermission) {
     return (
       <View style={styles.loadingContainer}>
         <Text style={{color: 'white', marginBottom: 10}}>需要相機權限</Text>
         <TouchableOpacity onPress={() => Linking.openSettings()}>
           <Text style={{color: '#007AFF'}}>去設定開啟</Text>
         </TouchableOpacity>
       </View>
     );
  }

  if (!device) {
    return <View style={styles.loadingContainer}><ActivityIndicator color="#FFF" /></View>;
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.headerSpacer} />

      <View style={styles.cameraWrapper}>
        {/* Loading Overlay - Placed outside ViewShot so it's not captured */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#FFF" />
          </View>
        )}

        <ViewShot
          ref={viewShotRef}
          style={styles.cameraBox}
          options={{ format: 'jpg', quality: 0.9 }}
        >
          {tempImagePath ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
               <Image 
                 source={{ uri: tempImagePath }} 
                 style={StyleSheet.absoluteFill} 
                 resizeMode="cover"
                 // Critical: Trigger save ONLY after image visual is ready
                 onLoad={saveCombinedImage} 
               />
            </View>
          ) : (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={!tempImagePath && !isProcessing} // Pause preview when processing
              photo={true}
              onInitialized={() => setIsCameraInitialized(true)}
            />
          )}

          {/* Filter Overlay */}
          {FILTER_ASSETS[filterId] && (
            <Image 
              source={FILTER_ASSETS[filterId]} 
              style={styles.overlay} 
              resizeMode="contain" 
            />
          )}
        </ViewShot>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          style={styles.controlItem} 
          onPress={handleOpenGallery}
          disabled={isProcessing}
        >
          <View style={styles.galleryIconPlaceholder}>
            <View style={[styles.galleryIconInner, styles.galleryIconBack]} />
            <View style={styles.galleryIconInner} />
          </View>
          <Text style={styles.controlLabel}>相簿</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.captureButtonOuter, isProcessing && { opacity: 0.5 }]}
          onPress={handleTakePhoto}
          activeOpacity={0.7}
          disabled={isProcessing || !isCameraInitialized}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlItem} 
          onPress={handleSwitchCamera} 
          disabled={isProcessing}
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
  mainContainer: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  headerSpacer: { 
    height: Platform.OS === 'ios' ? 60 : 40 
  },
  loadingContainer: { 
    flex: 1, 
    backgroundColor: '#000', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  cameraWrapper: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    position: 'relative'
  },
  cameraBox: {
    width: width,
    aspectRatio: ASPECT_RATIO,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
    borderRadius: 24,
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
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    borderRadius: 24,
  },
  controlsContainer: { 
    height: 140, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 40, 
    paddingBottom: 30 
  },
  controlItem: { 
    width: 60, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  controlLabel: { 
    color: '#FFF', 
    fontSize: 12, 
    marginTop: 8,
    fontWeight: '500'
  },
  captureButtonOuter: { 
    width: 76, 
    height: 76, 
    borderRadius: 38, 
    borderWidth: 4, 
    borderColor: 'rgba(255,255,255,0.4)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  captureButtonInner: { 
    width: 58, 
    height: 58, 
    borderRadius: 29, 
    backgroundColor: '#FFF' 
  },
  flipButton: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  flipText: { 
    fontSize: 22, 
    color: '#FFF', 
    fontWeight: 'bold' 
  },
  galleryIconPlaceholder: { 
    width: 40, 
    height: 40, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  galleryIconInner: { 
    position: 'absolute', 
    width: 32, 
    height: 32, 
    backgroundColor: '#E5E5E5', 
    borderRadius: 4, 
    borderWidth: 1, 
    borderColor: '#666' 
  },
  galleryIconBack: { 
    opacity: 0.6, 
    top: -4, 
    left: 4, 
    transform: [{ rotate: '6deg' }] 
  }
});

export default FilterCameraScreen;