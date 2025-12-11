// src/screens/ChatScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar } from '../components';
import { useAuth } from '../context/AuthContext';
import { useCoinsContext } from '../context/CoinsContext';
import type { RootStackParamList } from '../types/navigation';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants/theme';
// Import Vector Icons
import Ionicons from 'react-native-vector-icons/Ionicons';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

type ChatMessage = {
  id: string;
  fromMe: boolean;
  text: string;
  timestamp: string; // Added timestamp for visual flair
};

export const ChatScreen: React.FC = () => {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation();
  const { targetUserName } = route.params;

  const { user, signOut } = useAuth();
  const { coins } = useCoinsContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  
  // Ref to auto-scroll to bottom
  const flatListRef = useRef<FlatList>(null);

  const handleSend = () => {
    if (!input.trim()) return;

    const now = new Date();
    const timeString = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      fromMe: true,
      text: input.trim(),
      timestamp: timeString,
    };

    setMessages(prev => [...prev, newMsg]);
    setInput('');
  };

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <ScreenContainer>
      <TopBar coins={coins} onSettingsPress={signOut} />

      {/* Custom Chat Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{targetUserName.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{targetUserName}</Text>
            <Text style={styles.headerStatus}>Online</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubbleWrapper,
                item.fromMe ? styles.meWrapper : styles.otherWrapper,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  item.fromMe ? styles.meBubble : styles.otherBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    item.fromMe ? styles.meText : styles.otherText,
                  ]}
                >
                  {item.text}
                </Text>
                <Text style={[styles.timestamp, item.fromMe ? styles.meTimestamp : styles.otherTimestamp]}>
                  {item.timestamp}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Start chatting with {targetUserName}</Text>
            </View>
          }
        />

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  // Main Layout
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB', // Light gray background for chat area
  },
  
  // Custom Header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#1F2937',
  },
  headerStatus: {
    fontSize: 12,
    color: '#10B981', // Green for online
    fontWeight: '500',
  },

  // Message List
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,
    opacity: 0.7,
  },
  emptyText: {
    marginTop: 8,
    color: '#9CA3AF',
    fontSize: 14,
  },

  // Message Bubbles
  messageBubbleWrapper: {
    marginVertical: 4,
    width: '100%',
  },
  meWrapper: {
    alignItems: 'flex-end',
  },
  otherWrapper: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    // Shadows for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  meBubble: {
    backgroundColor: COLORS.secondary, // Or use a nice blue like #3B82F6
    borderBottomRightRadius: 4, // Visual flair
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4, // Visual flair
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  meText: {
    color: '#FFFFFF',
  },
  otherText: {
    color: '#1F2937',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  meTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherTimestamp: {
    color: '#9CA3AF',
  },

  // Input Area
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end', // Align bottom for multiline
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 16,
    fontSize: 15,
    color: '#1F2937',
    maxHeight: 100, // Limit height for multiline
    marginRight: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },
});