import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/auth';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Shipper Screens
import ShipperDashboard from '../screens/shipper/DashboardScreen';
import CreateLoadScreen from '../screens/shipper/CreateLoadScreen';
import MyLoadsScreen from '../screens/shipper/MyLoadsScreen';

// Carrier Screens
import CarrierDashboard from '../screens/carrier/DashboardScreen';
import AvailableLoadsScreen from '../screens/carrier/AvailableLoadsScreen';

// Common Screens
import LoadDetailScreen from '../screens/common/LoadDetailScreen';
import TrackingScreen from '../screens/common/TrackingScreen';
import ChatListScreen from '../screens/common/ChatListScreen';
import ChatScreen from '../screens/common/ChatScreen';
import ProfileScreen from '../screens/common/ProfileScreen';
import RatingScreen from '../screens/common/RatingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ShipperTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'MyLoads') iconName = 'cube';
          else if (route.name === 'Tracking') iconName = 'map';
          else if (route.name === 'Messages') iconName = 'chatbubbles';
          else if (route.name === 'Profile') iconName = 'person';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563eb',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={ShipperDashboard} options={{ title: 'Panel' }} />
      <Tab.Screen name="MyLoads" component={MyLoadsScreen} options={{ title: 'Mis Cargas' }} />
      <Tab.Screen name="Tracking" component={TrackingScreen} options={{ title: 'Seguimiento' }} />
      <Tab.Screen name="Messages" component={ChatListScreen} options={{ title: 'Mensajes' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

function CarrierTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'Loads') iconName = 'cube';
          else if (route.name === 'Tracking') iconName = 'map';
          else if (route.name === 'Messages') iconName = 'chatbubbles';
          else if (route.name === 'Profile') iconName = 'person';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563eb',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={CarrierDashboard} options={{ title: 'Panel' }} />
      <Tab.Screen name="Loads" component={AvailableLoadsScreen} options={{ title: 'Buscar Cargas' }} />
      <Tab.Screen name="Tracking" component={TrackingScreen} options={{ title: 'Seguimiento' }} />
      <Tab.Screen name="Messages" component={ChatListScreen} options={{ title: 'Mensajes' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, user, isLoading } = useAuthStore();

  if (isLoading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={user?.role === 'TRANSPORTER' ? CarrierTabs : ShipperTabs}
            />
            <Stack.Screen
              name="LoadDetail"
              component={LoadDetailScreen}
              options={{ headerShown: true, title: 'Detalles de la Carga' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }: any) => ({
                headerShown: true,
                title: route.params?.name || 'Chat',
                headerBackTitle: 'Mensajes',
              })}
            />
            <Stack.Screen
              name="CreateLoad"
              component={CreateLoadScreen}
              options={{ headerShown: true, title: 'Crear Carga' }}
            />
            <Stack.Screen
              name="Rating"
              component={RatingScreen}
              options={{ headerShown: true, title: 'Calificar Viaje' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
