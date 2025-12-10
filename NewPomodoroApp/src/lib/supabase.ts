import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jbcfmrpycmoffahbhfnr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiY2ZtcnB5Y21vZmZhaGJoZm5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDg0MTYsImV4cCI6MjA4MDQyNDQxNn0.I_cmrARHJsdI8yytzWi9WDKJJ8pWC8J7ChNZkSVTDWE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // 使用手機的原生儲存空間來記住登入狀態
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});