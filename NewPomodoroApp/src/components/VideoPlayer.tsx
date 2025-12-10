/**
 * VideoPlayer Component
 * 影片播放器組件
 */

import React, { useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Video, { VideoRef } from 'react-native-video';

const { width, height } = Dimensions.get('window');

interface VideoPlayerProps {
    isPlaying: boolean;
    source: any;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ isPlaying, source }) => {
    const videoRef = useRef<VideoRef>(null);

    return (
        <View style={styles.videoContainer}>
            <Video
                ref={videoRef}
                source={source}
                style={styles.video}
                resizeMode="contain"
                repeat={true}
                paused={!isPlaying}
                onError={(error: any) => console.log('Video Error:', error)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    videoContainer: {
        width: width * 0.59,
        height: height * 0.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    video: {
        width: '100%',
        height: '100%',
    },
});
