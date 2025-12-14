// src/utils/chatClient.ts
import TcpSocket from 'react-native-tcp-socket';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

// const HOST = 'Jays-MacBook-Pro-10.local';
const HOST = '61.224.32.83';
const PORT = 9090;


// Singleton socket
let socket: TcpSocket.Socket | null = null;
let isConnected = false;

// ✅ 防止同時多次 connect 造成「連兩次」
let connectPromise: Promise<boolean> | null = null;

// Buffer for incomplete TCP packets
let buffer = '';

// -------------------------
//   LISTENERS
// -------------------------
const messageListeners: Array<(msg: any) => void> = [];

// Add listener
export function addChatListener(callback: (msg: any) => void) {
  if (!messageListeners.includes(callback)) {
    messageListeners.push(callback);
  }
}

// Remove listener
export function removeChatListener(callback: (msg: any) => void) {
  const index = messageListeners.indexOf(callback);
  if (index !== -1) {
    messageListeners.splice(index, 1);
  }
}

// ===============================
// Send JSON to server
// ===============================
export function sendJson(payload: any) {
  if (!socket || !isConnected) {
    console.log('[ChatServer] Not connected → skip send', payload?.type);
    return;
  }

  try {
    socket.write(JSON.stringify(payload) + '\n');
  } catch (err) {
    console.log('[ChatServer] Send error:', err);
  }
}

export const sendChatMessage = sendJson;

// ===============================
// Connect to Java Chat Server
// ===============================
export function connectChatServer(userId: string): Promise<boolean> {
  // ✅ 已連線：直接回 true
  if (socket && isConnected) return Promise.resolve(true);

  // ✅ 正在連線中：共用同一個 promise（避免建立第二條連線）
  if (connectPromise) return connectPromise;

  connectPromise = new Promise((resolve) => {
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      connectPromise = null; // ✅ 結束後清掉，允許下次重連
      resolve(ok);
    };

    // ✅ timeout：避免卡死
    const timer = setTimeout(() => {
      console.log('[ChatServer] connect timeout');
      isConnected = false;
      try { socket?.destroy(); } catch {}
      socket = null;
      buffer = '';
      finish(false);
    }, 6000);

    try {
      // ✅ 保險：如果殘留舊 socket，先清掉
      try { socket?.destroy(); } catch {}
      socket = null;
      buffer = '';

      socket = TcpSocket.createConnection({ host: HOST, port: PORT }, () => {
        clearTimeout(timer);
        console.log('[ChatServer] Connected');
        isConnected = true;

        // → Send ONLINE heartbeat/login
        sendJson({
          type: 'ONLINE',
          userId,
          timestamp: Date.now(),
        });

        finish(true);
      });

      // --- Handle receiving data ---
      socket.on('data', (data) => {
        const incoming = data.toString('utf-8');
        buffer += incoming;

        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;

          try {
            const json = JSON.parse(line);
            // console.log('[Chat] recv JSON', json);

            messageListeners.forEach((cb) => {
              try {
                cb(json);
              } catch (e) {
                console.log('[Chat listener error]', e);
              }
            });
          } catch (err) {
            console.log('[Chat JSON parse fail]', err, 'text=', line);
          }
        }
      });

      // --- Handle errors ---
      socket.on('error', (error) => {
        clearTimeout(timer);
        console.log('[ChatServer] error:', error.message);

        isConnected = false;
        try { socket?.destroy(); } catch {}
        socket = null;
        buffer = '';

        finish(false);
      });

      // --- Handle close ---
      socket.on('close', () => {
        clearTimeout(timer);
        console.log('[ChatServer] closed');

        isConnected = false;
        socket = null;
        buffer = '';

        // ⚠️ close 可能發生在 connect 尚未 finish 的情況
        finish(false);
      });

    } catch (err) {
      clearTimeout(timer);
      console.log('[ChatServer EXCEPTION]', err);

      isConnected = false;
      socket = null;
      buffer = '';

      finish(false);
    }
  });

  return connectPromise;
}

// ===============================
// Disconnect
// ===============================
export function disconnectChatServer() {
  try {
    socket?.end();
    socket?.destroy();
  } catch {}

  socket = null;
  isConnected = false;
  connectPromise = null;
  buffer = '';
}

// ===============================
// History / Status helpers
// ===============================
export function getChatHistory(roomId: string, userId: string, beforeCreatedAt?: string) {
  const payload: any = {
    type: 'GET_HISTORY',
    roomId,
    userId,
  };

  if (beforeCreatedAt) payload.beforeCreatedAt = beforeCreatedAt;

  sendJson(payload);
}

export function checkUserOnline(targetUserId: string) {
  sendJson({
    type: 'GET_USER_STATUS',
    targetUserId,
  });
}

// ===============================
// Hook: connect on screen focus
// ===============================
export function useChatConnectOnFocus(userId?: string) {
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;

      let cancelled = false;

      (async () => {
        try {
          const ok = await connectChatServer(userId);
          if (!cancelled) console.log('[useChatConnectOnFocus] connect =', ok);
        } catch (e) {
          if (!cancelled) console.log('[useChatConnectOnFocus] error', e);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [userId])
  );
}

// Shortcut export
export const chatClient = {
  connect: connectChatServer,
  sendJson,
  sendChatMessage,
  addChatListener,
  removeChatListener,
  disconnect: disconnectChatServer,
  getChatHistory,
  checkUserOnline,
};