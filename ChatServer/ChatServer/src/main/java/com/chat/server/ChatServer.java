package com.chat.server;

import java.io.*;
import java.net.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.time.OffsetDateTime;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;

public class ChatServer {

    // ================================
    // Chat server config
    // ================================
    private static final int PORT = 12345;

    // Supabase REST API settings
    private static final String SUPABASE_URL = "https://jbcfmrpycmoffahbhfnr.supabase.co";
    private static final String ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiY2ZtcnB5Y21vZmZhaGJoZm5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDg0MTYsImV4cCI6MjA4MDQyNDQxNn0.I_cmrARHJsdI8yytzWi9WDKJJ8pWC8J7ChNZkSVTDWE";

    private final ServerSocket serverSocket;
    private final Gson gson = new Gson();

    // userId → ClientHandler
    private final Map<String, ClientHandler> onlineClients = new ConcurrentHashMap<>();
    private final Map<Socket, String> socketToUserId = new ConcurrentHashMap<>();

    public ChatServer(int port) throws IOException {
        serverSocket = new ServerSocket(port);
    }

    public static void main(String[] args) {
        try {
            ChatServer server = new ChatServer(PORT);
            System.out.println("ChatServer running on port " + PORT + "...");
            server.start();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    // ================================
    // Accept connections
    // ================================
    public void start() {
        while (true) {
            try {
                Socket clientSocket = serverSocket.accept();
                System.out.println("New connection: " + clientSocket.getRemoteSocketAddress());

                ClientHandler handler = new ClientHandler(this, clientSocket);
                new Thread(handler).start();

            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    // ================================
    // Handle incoming JSON messages
    // ================================
    public void handleMessage(ClientHandler handler, String line) {
        // System.out.println("RECV: " + line);

        JsonObject json;
        try {
            json = gson.fromJson(line, JsonObject.class);
        } catch (JsonSyntaxException e) {
            System.out.println("Invalid JSON: " + line);
            return;
        }

        if (json == null || !json.has("type")) {
            System.out.println("Missing type");
            return;
        }

        String type = json.get("type").getAsString();

        switch (type) {
            case "LOGIN":
                handleLogin(handler, json);
                break;

            case "ONLINE":
                handleOnline(handler, json);
                break;

            case "SEND_MESSAGE":
                handleSendMessage(handler, json);
                break;

            case "MARK_READ":
                handleMarkRead(handler, json);
                break;
            case "GET_HISTORY":
                handleGetHistory(handler, json);
                break;
            case "GET_USER_STATUS":
                handleGetUserStatus(handler, json);
                break;

            default:
                System.out.println("Unknown type: " + type);
        }
    }

    // ================================
    // User disconnect
    // ================================
    public void handleDisconnect(ClientHandler handler) {
        String userId = handler.getUserId();

        if (userId != null) {
            onlineClients.remove(userId);
            System.out.println("User disconnected: " + userId);
            broadcastUserStatus(userId, false);

            System.err.println("目前在線人目：" + onlineClients.size());
        }

        socketToUserId.remove(handler.getSocket());
    }

    // ================================
    // LOGIN
    // ================================
    private void handleLogin(ClientHandler handler, JsonObject json) {
        String userId = json.get("userId").getAsString();

        handler.setUserId(userId);
        onlineClients.put(userId, handler);
        socketToUserId.put(handler.getSocket(), userId);
        broadcastUserStatus(userId, true);

        // System.out.println("LOGIN: " + userId);
        System.err.println("目前在線人目：" + onlineClients.size());
    }

    // ================================
    // ONLINE heartbeat
    // ================================
    private void handleOnline(ClientHandler handler, JsonObject json) {
        String userId = json.get("userId").getAsString();

        if (handler.getUserId() == null) {
            handler.setUserId(userId);
            onlineClients.put(userId, handler);
            socketToUserId.put(handler.getSocket(), userId);
            System.out.println("ONLINE → auto-login: " + userId);
        }

        JsonObject resp = new JsonObject();
        resp.addProperty("type", "ONLINE_ACK");
        resp.addProperty("serverTime", Instant.now().toString());
        handler.sendJson(resp);

        broadcastUserStatus(userId, true);
        System.err.println("目前在線人目：" + onlineClients.size());
    }

    // ==========================================
    // ★ 新增：處理查詢特定用戶狀態
    // ==========================================
    private void handleGetUserStatus(ClientHandler handler, JsonObject json) {
        String targetId = json.get("targetUserId").getAsString();
        boolean isOnline = onlineClients.containsKey(targetId);

        JsonObject resp = new JsonObject();
        resp.addProperty("type", "USER_STATUS");
        resp.addProperty("userId", targetId);
        resp.addProperty("isOnline", isOnline);
        
        handler.sendJson(resp);
    }

    // ==========================================
    // ★ 新增：廣播用戶狀態變更 (給所有在線的人)
    // ==========================================
    private void broadcastUserStatus(String userId, boolean isOnline) {
        JsonObject json = new JsonObject();
        json.addProperty("type", "USER_STATUS_CHANGE");
        json.addProperty("userId", userId);
        json.addProperty("isOnline", isOnline);
        
        String jsonStr = gson.toJson(json);
        
        // 注意：在大型應用中，廣播給「所有人」效率很差。
        // 通常只會廣播給「好友」或「正在聊天室的人」。
        // 但為了實現你的需求，這裡先簡單地廣播給所有在線 Socket。
        for (ClientHandler client : onlineClients.values()) {
            // 不用通知自己
            if (!client.getUserId().equals(userId)) {
                client.sendRaw(jsonStr);
            }
        }
    }

    // ================================
    // SEND_MESSAGE
    // ================================
    // ================================
    // SEND_MESSAGE (修正版)
    // ================================
    private void handleSendMessage(ClientHandler handler, JsonObject json) {
        String roomId = json.get("roomId").getAsString();
        String senderId = json.get("senderId").getAsString();
        String content = json.get("content").getAsString();
        String tempId = json.has("tempId") ? json.get("tempId").getAsString() : null;

        // 1. 先存入資料庫 (這部分保持不變)
        MessageRecord msg = saveMessage(roomId, senderId, content);

        if (msg == null) {
            System.out.println("saveMessage failed");
            return;
        }

        // 2. 準備回傳的 JSON
        JsonObject out = new JsonObject();
        out.addProperty("type", "MESSAGE");
        out.addProperty("roomId", roomId);
        out.addProperty("messageId", msg.id); // 正式的 UUID
        out.addProperty("senderId", senderId);
        out.addProperty("content", content);
        out.addProperty("createdAt", msg.createdAt.toString());
        // 把前端傳來的 tempId 原封不動傳回去，讓前端可以消除半透明狀態
        if (tempId != null) out.addProperty("tempId", tempId);

        String jsonStr = gson.toJson(out);

        // ============================================================
        // ★ 核心修改：直接從 roomId 拆解出成員 ID，不依賴資料庫查詢
        // ============================================================
        String[] members;
        
        // 判斷 roomId 是否包含底線 (是否為 1對1 格式)
        if (roomId.contains("_")) {
            members = roomId.split("_");
        } else {
            // 如果是群組或其他格式，才去查資料庫 (或是維持原樣)
            List<String> dbMembers = getRoomMemberIds(roomId);
            members = dbMembers.toArray(new String[0]);
        }

        System.out.println("Broadcasting msg to room: " + roomId + ", members: " + Arrays.toString(members));

        // 3. 發送給所有在線成員 (包含自己)
        for (String targetUid : members) {
            ClientHandler ch = onlineClients.get(targetUid);
            
            if (ch != null) {
                // 如果對方在線，直接發送
                ch.sendRaw(jsonStr);
                // System.out.println(" -> Sent to " + targetUid);
            } else {
                // System.out.println(" -> User " + targetUid + " is offline");
            }
        }
    }

    // ================================
    // MARK_READ
    // ================================
    private void handleMarkRead(ClientHandler handler, JsonObject json) {
        String roomId = json.get("roomId").getAsString();
        String userId = json.get("userId").getAsString();
        String lastReadId = json.get("lastReadMessageId").getAsString();

        upsertRoomRead(roomId, userId, lastReadId);

        JsonObject resp = new JsonObject();
        resp.addProperty("type", "MARK_READ_ACK");
        resp.addProperty("roomId", roomId);
        resp.addProperty("userId", userId);
        handler.sendJson(resp);
    }

    // ======================================================
    // Supabase REST Functions
    // ======================================================

    // 1. 修改 handleGetHistory，接收 beforeCreatedAt
    private void handleGetHistory(ClientHandler handler, JsonObject json) {
        String roomId = json.get("roomId").getAsString();
        String beforeCreatedAt = json.has("beforeCreatedAt") ? json.get("beforeCreatedAt").getAsString() : null;

        // 傳入 beforeCreatedAt
        List<JsonObject> messages = fetchRoomMessages(roomId, beforeCreatedAt);

        JsonObject resp = new JsonObject();
        resp.addProperty("type", "HISTORY");
        resp.addProperty("roomId", roomId);
        
        // 把這次請求的參考時間點傳回去，方便前端判斷是「初始載入」還是「載入更多」
        if (beforeCreatedAt != null) {
            resp.addProperty("requestBefore", beforeCreatedAt);
        }

        com.google.gson.JsonArray data = new com.google.gson.JsonArray();
        for (JsonObject msg : messages) {
            data.add(msg);
        }
        resp.add("data", data);

        handler.sendJson(resp);
    }

    // 修正後的 fetchRoomMessages：加入 URL 編碼
    private List<JsonObject> fetchRoomMessages(String roomId, String beforeCreatedAt) {
        List<JsonObject> list = new ArrayList<>();
        try {
            // ★ 修正 1：對 roomId 進行 URL 編碼，雖然 UUID 通常安全，但這是好習慣
            String encodedRoomId = URLEncoder.encode(roomId, "UTF-8");
            
            // 使用 StringBuilder 構建基礎查詢
            StringBuilder query = new StringBuilder("/rest/v1/chat_messages?room_id=eq." + encodedRoomId);

            // ★ 修正 2：對時間字串進行 URL 編碼
            // 這會把 "2025...T...+00:00" 的 "+" 轉成 "%2B"，避免被誤判為空白
            if (beforeCreatedAt != null) {
                String encodedTime = URLEncoder.encode(beforeCreatedAt, "UTF-8");
                query.append("&created_at=lt.").append(encodedTime);
            }

            query.append("&order=created_at.desc&limit=50");

            URL url = new URL(SUPABASE_URL + query.toString());

            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);

            // 檢查 Response Code，方便除錯
            int status = conn.getResponseCode();
            if (status >= 400) {
                // 如果失敗，讀取錯誤訊息以便除錯
                BufferedReader errorReader = new BufferedReader(new InputStreamReader(conn.getErrorStream(), "UTF-8"));
                StringBuilder errorSb = new StringBuilder();
                String line;
                while ((line = errorReader.readLine()) != null) errorSb.append(line);
                errorReader.close();
                System.out.println("Supabase Error (" + status + "): " + errorSb.toString());
                return list;
            }

            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();

            com.google.gson.JsonArray arr = JsonParser.parseString(sb.toString()).getAsJsonArray();

            for (int i = 0; i < arr.size(); i++) {
                JsonObject row = arr.get(i).getAsJsonObject();
                JsonObject msg = new JsonObject();
                msg.addProperty("messageId", row.get("id").getAsString());
                msg.addProperty("roomId", row.get("room_id").getAsString());
                msg.addProperty("senderId", row.get("sender_id").getAsString());
                msg.addProperty("content", row.get("content").getAsString());
                msg.addProperty("createdAt", row.get("created_at").getAsString());
                list.add(msg);
            }
        } catch (Exception e) {
            System.out.println("fetchRoomMessages Exception: " + e.getMessage());
            e.printStackTrace();
        }
        return list;
    }

    

    private static class MessageRecord {
        String id;
        Instant createdAt;
    }

    // Save message into Supabase
    private MessageRecord saveMessage(String roomId, String senderId, String content) {
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/chat_messages");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();

            conn.setRequestMethod("POST");
            // Note: For a server, it is safer to use the SERVICE_ROLE_KEY here instead of ANON_KEY
            // to bypass Row Level Security (RLS) policies.
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=representation");
            conn.setDoOutput(true);

            // FIX 1: Use Gson to build JSON safely
            // Manual string concatenation causes HTTP 400 on special characters
            JsonObject payload = new JsonObject();
            payload.addProperty("room_id", roomId);
            payload.addProperty("sender_id", senderId);
            payload.addProperty("content", content);
            
            String body = gson.toJson(payload);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes("UTF-8"));
            }

            int code = conn.getResponseCode();
            
            // FIX 2: Read the error details from Supabase if request fails
            if (code >= 400) {
                InputStream errorStream = conn.getErrorStream();
                String errorMsg = "No error details";
                if (errorStream != null) {
                    try (BufferedReader br = new BufferedReader(new InputStreamReader(errorStream, "UTF-8"))) {
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = br.readLine()) != null) {
                            sb.append(line);
                        }
                        errorMsg = sb.toString();
                    }
                }
                System.out.println("Supabase insert error HTTP " + code + " Body: " + body);
                System.out.println("Supabase Error Response: " + errorMsg);
                return null;
            }

            // Read Success Response
            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            br.close();

            String response = sb.toString();
            com.google.gson.JsonArray arr = JsonParser.parseString(response).getAsJsonArray();

            if (arr.size() == 0) return null;

            com.google.gson.JsonObject obj = arr.get(0).getAsJsonObject();
            MessageRecord m = new MessageRecord();
            m.id = obj.get("id").getAsString();
            String createdAtStr = obj.get("created_at").getAsString();
            m.createdAt = OffsetDateTime.parse(createdAtStr).toInstant();
            return m;

        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    // Fetch members of a room
    private List<String> getRoomMemberIds(String roomId) {
        List<String> list = new ArrayList<>();

        try {
            URL url = new URL(
                SUPABASE_URL + "/rest/v1/chat_room_members?room_id=eq." + roomId
            );
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();

            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);

            // ⭐ Java 8 讀取 input stream
            BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), "UTF-8")
            );

            StringBuilder sb = new StringBuilder();
            String line;

            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            br.close();

            String response = sb.toString();

            // ⭐ Java 8 不能用 var
            com.google.gson.JsonArray arr =
                    JsonParser.parseString(response).getAsJsonArray();

            for (int i = 0; i < arr.size(); i++) {
                com.google.gson.JsonObject el = arr.get(i).getAsJsonObject();
                String uid = el.get("user_id").getAsString();
                list.add(uid);
            }

        } catch (Exception e) {
            e.printStackTrace();
        }

        return list;
    }

    // Upsert read record
    private void upsertRoomRead(String roomId, String userId, String msgId) {
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/chat_room_reads");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();

            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "resolution=merge-duplicates");
            conn.setDoOutput(true);

            String body = "{"
                    + "\"room_id\":\"" + roomId + "\","
                    + "\"user_id\":\"" + userId + "\","
                    + "\"last_read_message_id\":\"" + msgId + "\""
                    + "}";

            conn.getOutputStream().write(body.getBytes());
            conn.getResponseCode();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // ======================================================
    // Client handler (each socket connection)
    // ======================================================
    public static class ClientHandler implements Runnable {
        private final ChatServer server;
        private final Socket socket;
        private BufferedReader in;
        private PrintWriter out;
        private String userId;

        public ClientHandler(ChatServer server, Socket socket) {
            this.server = server;
            this.socket = socket;
        }

        public String getUserId() { return userId; }
        public void setUserId(String id) { userId = id; }
        public Socket getSocket() { return socket; }

        @Override
        public void run() {
            try {
                in = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                out = new PrintWriter(socket.getOutputStream(), true);

                String line;
                while ((line = in.readLine()) != null) {
                    server.handleMessage(this, line);
                }

            } catch (Exception e) {
                System.out.println("Client error: " + e.getMessage());
            } finally {
                server.handleDisconnect(this);
                close();
            }
        }

        public void sendJson(JsonObject json) {
            sendRaw(json.toString());
        }

        public void sendRaw(String text) {
            out.println(text);
            out.flush();
        }

        private void close() {
            try { if (in != null) in.close(); } catch (Exception ignored) {}
            try { if (out != null) out.close(); } catch (Exception ignored) {}
            try { socket.close(); } catch (Exception ignored) {}
        }
    }
}