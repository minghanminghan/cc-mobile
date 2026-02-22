import 'react-native-get-random-values';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import ProfileListScreen from './src/screens/ProfileListScreen';
import ProfileFormScreen from './src/screens/ProfileFormScreen';
import TerminalScreen from './src/screens/TerminalScreen';
import type { Profile } from './src/lib/profiles';

export type RootStackParamList = {
  ProfileList: undefined;
  ProfileForm: { profile?: Profile };
  Terminal: { profile: Profile };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#18181b' }, // zinc-900
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#09090b' }, // zinc-950
        }}
      >
        <Stack.Screen
          name="ProfileList"
          component={ProfileListScreen}
          options={{ title: 'Connections' }}
        />
        <Stack.Screen
          name="ProfileForm"
          component={ProfileFormScreen}
          options={({ route }) => ({
            title: route.params?.profile ? 'Edit Connection' : 'New Connection'
          })}
        />
        <Stack.Screen
          name="Terminal"
          component={TerminalScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
