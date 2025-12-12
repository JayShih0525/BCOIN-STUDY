import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AuthScreen() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 1. 從 AuthContext 取得登入/註冊功能
  const { signIn, signUp, isLoading } = useAuth();

  const handleSubmit = async () => {
    // 2. 基本驗證
    if (!email.trim().toLowerCase().endsWith('.edu.tw')) {
      Alert.alert('Email 格式錯誤', '請使用學校信箱 (結尾需為 .edu.tw)');
      return;
    }
    if (!password) {
      Alert.alert('請輸入密碼');
      return;
    }

    if (isLoginMode) {
      // ✅ 修正點：登入時傳入 email 和 password
      await signIn(email, password);
    } else {
      // 註冊模式
      if (password !== confirmPassword) {
        Alert.alert('密碼不一致', '「密碼」與「確認密碼」不相符，請重新輸入。');
        return;
      }
      if (password.length < 6) {
        Alert.alert('密碼過短', '請設定至少 6 位數的密碼');
        return;
      }

      // ✅ 修正點：註冊時傳入 email 和 password
      await signUp(email, password);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.card}>
          <Text style={styles.title}>
            {isLoginMode ? '登入' : '註冊'}
          </Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="電子郵件 (.edu.tw)"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="密碼"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {!isLoginMode && (
              <TextInput
                style={styles.input}
                placeholder="確認密碼"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            )}
          </View>

          <TouchableOpacity 
            style={[styles.button, isLoading && styles.buttonDisabled]} 
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? '處理中...' : (isLoginMode ? '登入' : '註冊')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setIsLoginMode(!isLoginMode);
              setPassword('');
              setConfirmPassword('');
            }}
            style={styles.switchButton}
          >
            <Text style={styles.switchText}>
              {isLoginMode
                ? '還沒有帳號嗎？ 點擊這裡註冊'
                : '已經有帳號了？ 點擊這裡登入'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#B2DFDB',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  button: {
    backgroundColor: '#009688',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#80CBC4', // 載入時變淡
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: '#00796B',
    fontSize: 14,
  },
});