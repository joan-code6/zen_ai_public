import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { DrawerWrapper } from '../components/DrawerWrapper';

// screens
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import NotesScreen from '../screens/NotesScreen';
import NoteEditScreen from '../screens/NoteEditScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EmailScreen from '../screens/EmailScreen';
import CalendarScreen from '../screens/CalendarScreen';
import { colors } from '../theme/tokens';

// ─── param lists ─────────────────────────────────────────────────────────────

// define the types for our navigation stacks to get type safety when navigating and accessing route params
export type AuthStackParams = { 
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type AppStackParams = {
  Home: undefined;
  Chat: { chatId: string; title?: string; initialMessage?: string };
  Notes: undefined;
  NoteEdit: { noteId?: string };  // undefined = new note
  Settings: undefined;
  Email: undefined;
  Calendar: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppStack = createNativeStackNavigator<AppStackParams>();

const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <DrawerWrapper>
      <AppStack.Navigator 
        screenOptions={{ 
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <AppStack.Screen name="Home" component={HomeScreen} />
        <AppStack.Screen name="Chat" component={ChatScreen} />
        <AppStack.Screen name="Notes" component={NotesScreen} />
        <AppStack.Screen name="NoteEdit" component={NoteEditScreen} />
        <AppStack.Screen name="Settings" component={SettingsScreen} />
        <AppStack.Screen name="Email" component={EmailScreen} />
        <AppStack.Screen name="Calendar" component={CalendarScreen} />
      </AppStack.Navigator>
    </DrawerWrapper>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <View style={styles.loading} />;

  return (
    <NavigationContainer theme={DarkTheme}>
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
