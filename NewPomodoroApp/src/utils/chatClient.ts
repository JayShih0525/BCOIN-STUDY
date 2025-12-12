// src/utils/chatClient.ts
import TcpSocket from 'react-native-tcp-socket';

// const HOST = 'Jays-MacBook-Pro-10.local';
// const PORT = 12345;
const HOST = 'http://nch000001.duckdns.org/';
const PORT = 8080;

// Singleton socket
let socket: TcpSocket.Socket | null = null;
let isConnected = false;

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
// Connect to Java Chat Server
// ===============================
export function connectChatServer(userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (socket && isConnected) {
      resolve(true);
      return;
    }

    try {
      socket = TcpSocket.createConnection({ host: HOST, port: PORT }, () => {
        console.log('[ChatServer] Connected');
        isConnected = true;

        // → Send ONLINE heartbeat/login
        sendJson({
          type: 'ONLINE',
          userId,
          timestamp: Date.now(),
        });

        resolve(true);
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
            console.log('[Chat] recv JSON', json);

            // Notify all listeners
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
        console.log('[ChatServer] error:', error.message);
        isConnected = false;
        socket?.destroy();
        socket = null;
        buffer = '';
        resolve(false);
      });

      // --- Handle close ---
      socket.on('close', () => {
        console.log('[ChatServer] closed');
        isConnected = false;
        socket = null;
        buffer = '';
      });

    } catch (err) {
      console.log('[ChatServer EXCEPTION]', err);
      isConnected = false;
      socket = null;
      buffer = '';
      resolve(false);
    }
  });
}

// ===============================
// Send JSON to server
// ===============================
export function sendJson(payload: any) {
  if (!socket || !isConnected) {
    console.log('[ChatServer] Not connected → skip send');
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
// Disconnect
// ===============================
export function disconnectChatServer() {
  try {
    socket?.end();
    socket?.destroy();
  } catch {}
  socket = null;
  isConnected = false;
  buffer = '';
}


export function getChatHistory(roomId: string, userId: string, beforeCreatedAt?: string) {
  const payload: any = {
    type: 'GET_HISTORY',
    roomId,
    userId,
  };
  
  if (beforeCreatedAt) {
    payload.beforeCreatedAt = beforeCreatedAt;
  }

  sendJson(payload);
}

export function checkUserOnline(targetUserId: string) {
  sendJson({
    type: 'GET_USER_STATUS',
    targetUserId,
  });
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
  checkUserOnline
};