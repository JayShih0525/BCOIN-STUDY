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
        System.out.println("RECV: " + line);

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

        System.out.println("LOGIN: " + userId);
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
    }

    // ================================
    // SEND_MESSAGE
    // ================================
    private void handleSendMessage(ClientHandler handler, JsonObject json) {
        String roomId = json.get("roomId").getAsString();
        String senderId = json.get("senderId").getAsString();
        String content = json.get("content").getAsString();
        String tempId = json.has("tempId") ? json.get("tempId").getAsString() : null;

        MessageRecord msg = saveMessage(roomId, senderId, content);

        if (msg == null) {
            System.out.println("saveMessage failed");
            return;
        }

        List<String> members = getRoomMemberIds(roomId);

        JsonObject out = new JsonObject();
        out.addProperty("type", "MESSAGE");
        out.addProperty("roomId", roomId);
        out.addProperty("messageId", msg.id);
        out.addProperty("senderId", senderId);
        out.addProperty("content", content);
        out.addProperty("createdAt", msg.createdAt.toString());
        if (tempId != null) out.addProperty("tempId", tempId);

        String jsonStr = gson.toJson(out);

        for (String uid : members) {
            ClientHandler ch = onlineClients.get(uid);
            if (ch != null) ch.sendRaw(jsonStr);
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