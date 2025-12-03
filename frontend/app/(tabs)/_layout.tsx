// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { View } from "react-native";
// Icons Import
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// Import our new Provider and Toast
import { ChatProvider } from '../../Contexts/ChatContext';
import { OfflineMessageToast } from '../../Components/common/OfflineMessageToast';

export default function TabsLayout() {
  return (
    <ChatProvider>
      {}
      <View style={{ flex: 1 }}>
        
        {}
        <OfflineMessageToast />

        <Tabs screenOptions={{ tabBarActiveBackgroundColor: "lightgreen" }}>
          <Tabs.Screen 
            name="index" 
            options={{ 
              title: "Chats", 
              tabBarIcon: ({ color }) => (<Ionicons name="chatbubbles-outline" size={24} color={color} />) 
            }} 
          />
          <Tabs.Screen 
            name="Groups" 
            options={{ 
              title: "Groups", 
              tabBarIcon: ({ color }) => (<MaterialIcons name="groups" size={24} color={color} />) 
            }} 
          />
          <Tabs.Screen 
            name="AI" 
            options={{ 
              title: "Ask AI", 
              tabBarIcon: ({ color }) => (<Ionicons name="sparkles" size={24} color={color} />) 
            }} 
          />
        </Tabs>
      </View>
    </ChatProvider>
  );
}