// src/utils/tcpClient.ts
import TcpSocket from 'react-native-tcp-socket';

let client: TcpSocket.Socket | null = null;
let onMessageCallback: ((msg: string) => void) | null = null;

export function setOnMessage(cb: (msg: string) => void) {
  onMessageCallback = cb;
}

export function connectToChatServer(userId: string) {
  if (client && !client.destroyed) return;

  client = TcpSocket.createConnection(
    {
      host: '192.168.0.123', // ⚠️ 換成你 Mac 的 IPv4
      port: 12345,
    },
    () => {
      console.log('✅ TCP connected');
      // 換成你 Java server 規定的登入協議
      client?.write(JSON.stringify({ type: 'login', userId }) + '\n');
    }
  );

  client.on('data', (data) => {
    const text = data.toString('utf-8').trim();
    console.log('📩 recv:', text);
    onMessageCallback?.(text);
  });

  client.on('error', (err) => {
    console.log('socket error', err);
  });

  client.on('close', () => {
    console.log('socket closed');
    client = null;
  });
}

export function sendChatMessage(payload: any) {
  if (!client || client.destroyed) return;
  client.write(JSON.stringify(payload) + '\n');
}

export function disconnectChat() {
  if (client && !client.destroyed) {
    client.destroy();
  }
  client = null;
}