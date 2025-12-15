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
import com.google.gson.JsonElement; // 引入 JsonElement

public class ChatServer {

    // ================================
    // Chat server config
    // ================================
    private static final int PORT = 9090;

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

    private static String getLocalIP() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();

            String candidate = null; 

            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();

                if (!iface.isUp() || iface.isLoopback() || iface.isVirtual()) {
                    continue;
                }

                String name = iface.getName();
                boolean isWifi = name.startsWith("en") || name.startsWith("wl");

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();

                    if (!(addr instanceof Inet4Address)) continue;

                    String ip = addr.getHostAddress();

                    if (ip.startsWith("169.254.")) continue;

                    if (isWifi) {
                        System.out.println("[IP] 使用 Wi-Fi 介面 " + name + " → " + ip);
                        return ip;
                    }

                    if (candidate == null && addr.isSiteLocalAddress()) {
                        candidate = ip;
                    }
                }
            }

            if (candidate != null) {
                System.out.println("[IP] 使用備用 LAN IP → " + candidate);
                return candidate;
            }

        } catch (Exception e) {
            e.printStackTrace();
        }

        System.out.println("[IP] 找不到合適的 IPv4，使用 127.0.0.1");
        return "127.0.0.1";
    }

    public static void main(String[] args) {
        try {
            ChatServer server = new ChatServer(PORT);
            getLocalIP();
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

            System.err.println("目前在線人數：" + onlineClients.size());
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

        System.err.println("目前在線人數：" + onlineClients.size());
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
        System.err.println("目前在線人數：" + onlineClients.size());
    }

    // ==========================================
    // 處理查詢特定用戶狀態
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
    // 廣播用戶狀態變更
    // ==========================================
    private void broadcastUserStatus(String userId, boolean isOnline) {
        JsonObject json = new JsonObject();
        json.addProperty("type", "USER_STATUS_CHANGE");
        json.addProperty("userId", userId);
        json.addProperty("isOnline", isOnline);
        
        String jsonStr = gson.toJson(json);
        
        for (ClientHandler client : onlineClients.values()) {
            if (!client.getUserId().equals(userId)) {
                client.sendRaw(jsonStr);
            }
        }
    }

    // ================================
    // SEND_MESSAGE (即時訊息處理)
    // ================================
    private void handleSendMessage(ClientHandler handler, JsonObject json) {
        String roomId = json.get("roomId").getAsString();
        String senderId = json.get("senderId").getAsString();
        String content = json.get("content").getAsString();
        String tempId = json.has("tempId") ? json.get("tempId").getAsString() : null;
        boolean isServer = json.has("isServer") ? json.get("isServer").getAsBoolean() : false;

        // 1. 先存入資料庫
        MessageRecord msg = saveMessage(roomId, senderId, content, isServer);

        if (msg == null) {
            System.out.println("saveMessage failed");
            return;
        }
        
        // ★ 核心修改點 1: 獲取發送者的 display_name (用於即時廣播)
        String senderDisplayName = fetchDisplayName(senderId);

        // 2. 準備回傳的 JSON
        JsonObject out = new JsonObject();
        out.addProperty("type", "MESSAGE");
        out.addProperty("roomId", roomId);
        out.addProperty("messageId", msg.id); // 正式的 UUID
        out.addProperty("isServer", isServer);
        out.addProperty("senderId", senderId);
        out.addProperty("senderDisplayName", senderDisplayName); // 加入 display_name
        out.addProperty("content", content);
        out.addProperty("createdAt", msg.createdAt.toString());
        if (tempId != null) out.addProperty("tempId", tempId);

        String jsonStr = gson.toJson(out);

        // 3. 確定廣播成員
        String[] members;
        
        if (roomId.contains("_")) {
            members = roomId.split("_");
        } else {
            List<String> dbMembers = getRoomMemberIds(roomId);
            members = dbMembers.toArray(new String[0]);
        }

        // 4. 發送給所有在線成員 (包含自己)
        for (String targetUid : members) {
            ClientHandler ch = onlineClients.get(targetUid);
            
            if (ch != null) {
                ch.sendRaw(jsonStr);
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

    /**
     * 輔助方法：單個用戶獲取 display_name
     */
    private String fetchDisplayName(String userId) {
        Map<String, String> names = fetchDisplayNamesBatch(Collections.singleton(userId));
        return names.getOrDefault(userId, userId); 
    }

    /**
     * 批量查詢多個用戶的 display_name
     * @param userIds 唯一用戶 ID 集合
     * @return Map<userId, displayName>
     */
    private Map<String, String> fetchDisplayNamesBatch(Set<String> userIds) {
        Map<String, String> namesMap = new HashMap<>();
        if (userIds.isEmpty()) return namesMap;
        
        try {
            // 構建查詢字串：?user_id=in.(id1,id2,id3...)
            String idList = String.join(",", userIds);
            String encodedIdList = URLEncoder.encode("(" + idList + ")", "UTF-8");
            
            String query = "/rest/v1/user_profiles?user_id=in." + encodedIdList + "&select=user_id,display_name";

            URL url = new URL(SUPABASE_URL + query);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);

            if (conn.getResponseCode() != 200) {
                System.err.println("Failed to fetch display names batch. HTTP Status: " + conn.getResponseCode());
                return namesMap;
            }

            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();

            com.google.gson.JsonArray arr = JsonParser.parseString(sb.toString()).getAsJsonArray();

            for (int i = 0; i < arr.size(); i++) {
                JsonObject obj = arr.get(i).getAsJsonObject();
                String userId = obj.get("user_id").getAsString();
                String displayName = userId; 
                
                if (obj.has("display_name") && !obj.get("display_name").isJsonNull()) {
                    displayName = obj.get("display_name").getAsString();
                }
                namesMap.put(userId, displayName);
            }
        } catch (Exception e) {
            System.err.println("fetchDisplayNamesBatch Exception: " + e.getMessage());
        }
        return namesMap;
    }


    // ==========================================
    // 歷史訊息處理 (使用兩階段查詢)
    // ==========================================
    private void handleGetHistory(ClientHandler handler, JsonObject json) {
        String roomId = json.get("roomId").getAsString();
        String beforeCreatedAt = json.has("beforeCreatedAt") ? json.get("beforeCreatedAt").getAsString() : null;

        // 執行兩階段查詢並合併
        List<JsonObject> messages = fetchRoomMessages(roomId, beforeCreatedAt);

        JsonObject resp = new JsonObject();
        resp.addProperty("type", "HISTORY");
        resp.addProperty("roomId", roomId);
        
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

    /**
     * 歷史訊息查詢 (兩階段查詢)
     * 階段 1: 查詢 chat_messages
     * 階段 2: 批量查詢 sender 的 display_name，並合併
     */
    private List<JsonObject> fetchRoomMessages(String roomId, String beforeCreatedAt) {
        List<JsonObject> list = new ArrayList<>();
        Set<String> uniqueSenderIds = new HashSet<>(); // 用於收集唯一的 senderId
        
        // ------------------------------------
        // 第一階段: 查詢訊息本身 (只選基本欄位，避免 PostgREST 嵌套 Object)
        // ------------------------------------
        try {
            String encodedRoomId = URLEncoder.encode(roomId, "UTF-8");
            
            StringBuilder query = new StringBuilder("/rest/v1/chat_messages?room_id=eq." + encodedRoomId);

            if (beforeCreatedAt != null) {
                String encodedTime = URLEncoder.encode(beforeCreatedAt, "UTF-8");
                query.append("&created_at=lt.").append(encodedTime);
            }

            // ★ 修正 1：只選擇所有基本欄位，不使用點記法
            query.append("&select=id,room_id,sender_id,content,created_at,\"isServer\"&order=created_at.desc&limit=50");
            
            URL url = new URL(SUPABASE_URL + query.toString());

            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);

            int status = conn.getResponseCode();
            if (status >= 400) {
                BufferedReader errorReader = new BufferedReader(new InputStreamReader(conn.getErrorStream(), "UTF-8"));
                StringBuilder errorSb = new StringBuilder();
                String line;
                while ((line = errorReader.readLine()) != null) errorSb.append(line);
                errorReader.close();
                System.out.println("Supabase History Error (" + status + "): " + errorSb.toString());
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
                
                // 處理 isServer
                boolean isServer = row.has("isServer") && !row.get("isServer").isJsonNull() 
                                   ? row.get("isServer").getAsBoolean() 
                                   : (row.has("isServer") && !row.get("isServer").isJsonNull() ? row.get("isServer").getAsBoolean() : false);


                msg.addProperty("messageId", row.get("id").getAsString());
                msg.addProperty("roomId", row.get("room_id").getAsString());
                msg.addProperty("content", row.get("content").getAsString());
                msg.addProperty("createdAt", row.get("created_at").getAsString());
                msg.addProperty("isServer", isServer);
                
                // ★ 核心修正 2 (解決 JsonObject 錯誤): 安全地提取 sender_id
                JsonElement senderIdElement = row.get("sender_id");
                String senderId = null;

                if (senderIdElement != null) {
                    if (senderIdElement.isJsonPrimitive()) {
                        senderId = senderIdElement.getAsString();
                    } else if (senderIdElement.isJsonObject()) {
                        // 雖然我們只選了基本欄位，但如果 Supabase 仍返回物件，我們從物件中提取 ID
                        // 假設物件結構是 {"id": "uuid"}
                        if (senderIdElement.getAsJsonObject().has("id")) {
                            senderId = senderIdElement.getAsJsonObject().get("id").getAsString();
                        }
                    }
                }
                
                if (senderId != null) {
                    msg.addProperty("senderId", senderId);
                    uniqueSenderIds.add(senderId); // 收集 ID 以供第二階段查詢
                } else {
                    System.err.println("Warning: sender_id missing or invalid for a message in room " + roomId);
                    continue; // 跳過無效的訊息
                }
                
                list.add(msg);
            }
        } catch (Exception e) {
            System.out.println("fetchRoomMessages Exception: " + e.getMessage());
            e.printStackTrace();
            return list;
        }
        
        // ------------------------------------
        // 第二階段: 批量查詢名稱並合併
        // ------------------------------------
        Map<String, String> namesMap = fetchDisplayNamesBatch(uniqueSenderIds);
        
        for (JsonObject msg : list) {
            String senderId = msg.get("senderId").getAsString();
            String displayName = namesMap.getOrDefault(senderId, senderId); // 找不到則 fallback 到 senderId
            msg.addProperty("senderDisplayName", displayName);
        }
        
        return list;
    }

    

    private static class MessageRecord {
        String id;
        Instant createdAt;
    }

    // Save message into Supabase
    private MessageRecord saveMessage(String roomId, String senderId, String content, boolean isServer) {
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/chat_messages");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();

            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=representation");
            conn.setDoOutput(true);

            JsonObject payload = new JsonObject();
            payload.addProperty("room_id", roomId);
            payload.addProperty("sender_id", senderId);
            payload.addProperty("content", content);
            payload.addProperty("isServer", isServer);
            
            String body = gson.toJson(payload);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes("UTF-8"));
            }

            int code = conn.getResponseCode();
            
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
            String encodedRoomId = URLEncoder.encode(roomId, "UTF-8");
            URL url = new URL(SUPABASE_URL + "/rest/v1/chat_room_members?room_id=eq." + encodedRoomId);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();

            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + ANON_KEY);

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