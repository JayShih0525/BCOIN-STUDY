# Assets 資料夾

## 影片放置說明

請將您的樹和人物動畫影片放在這個資料夾中，並命名為：

```
tree_animation.mp4
```

## 影片格式建議

- **格式**：MP4 (H.264)
- **解析度**：建議 720p 或 1080p
- **方向**：直向 (Portrait)
- **檔案大小**：建議小於 10MB 以獲得最佳性能

## 如何更換影片

如果您想使用不同的影片名稱，請修改 `App.tsx` 中的這一行：

```typescript
source={require('./assets/tree_animation.mp4')}
```

將 `tree_animation.mp4` 改成您的影片檔名。
