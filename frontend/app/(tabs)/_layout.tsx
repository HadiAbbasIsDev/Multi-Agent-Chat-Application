//Import Essential Libraries
import { Tabs } from "expo-router";
//Icons Import
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function TabsLayout(){
    return (
        <Tabs screenOptions={{tabBarActiveBackgroundColor:"lightgreen"}}>
            <Tabs.Screen name="index" options={{title: "Chats",tabBarIcon: ()=> (<Ionicons name="chatbubbles-outline" size={24} color="black" />)}}/>
            <Tabs.Screen name="Groups" options={{title:"Groups", tabBarIcon:()=>(<MaterialIcons name="groups" size={24} color="black" />)}}/>
            <Tabs.Screen name="AI" options={{title:"Ask AI",tabBarIcon: ()=>(<Ionicons name="sparkles" size={24} color="black" />)}}/>
        </Tabs>
    )
}
    