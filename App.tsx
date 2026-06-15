import './global.css';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SwipeScreen from './src/screens/SwipeScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import type { RootStackParamList } from './src/types';

// ─── Navigator ───────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── App Root ────────────────────────────────────────────────────────────────

/**
 * Punto de entrada de la aplicación.
 * Jerarquía de providers (orden importante):
 *   GestureHandlerRootView → SafeAreaProvider → NavigationContainer
 */
export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView className="flex-1 bg-neutral-950">
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Swipe"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0a0a0a' },
            }}
          >
            <Stack.Screen name="Swipe" component={SwipeScreen} />
            <Stack.Screen
              name="Review"
              component={ReviewScreen}
              options={{
                presentation: 'modal',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
