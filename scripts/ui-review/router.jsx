import { useEffect } from 'react';
import { View, Pressable, Text } from 'react-native';
export const activeScreen = new URLSearchParams(location.search).get('screen') || 'quick-chat';
const aliases = { '/legal/[document]':'guidelines', '/auth':'auth', '/wallet':'wallet', '/messages/new':'new-message', '/settings/account':'settings', '/settings/safety':'safety', '/clubs/create':'club-create', '/profile/edit':'profile-edit', '/clubs/[clubId]':'club', '/clubs/room/[roomId]':'room', '/people/[userId]':'person', '/post/[postId]':'post' };
function go(target) { const p = typeof target === 'string' ? target : target.pathname; location.assign('/?screen=' + (aliases[p] || (p.includes('[conversationId]') || p.includes('[sessionId]') ? 'chat' : p.split('/').pop()))); }
export const router = { navigate:go, push:go, replace:go, back:() => history.back() };
export function useFocusEffect(effect) { useEffect(effect, [effect]); }
export function useLocalSearchParams() { return { document:'community-guidelines', conversationId:'review-chat', partnerId:'review-other', partnerName:'Jules', topic:'Music', sessionId:'review-match', userId:'review-other', callId:'review-call', clubId:'1', roomId:'room', postId:'1', body:'Unpopular opinion: the walk home after a concert is part of the concert.', author:'Jules', authorId:'review-other' }; }
export function Redirect() { return null; }
export function Tabs({ children, screenOptions }) {
  return <View style={{ position:'absolute', bottom:0, left:0, right:0, flexDirection:'row', ...screenOptions({ route:{ name:activeScreen } }).tabBarStyle.reduce((a,b)=>({...a,...b}),{}) }}>
    {screenOptions({route:{name:activeScreen}}).tabBarBackground?.()}
    {children.map(child => { const {name, options} = child.props; const o = screenOptions({route:{name}}); const focused = name === activeScreen; return <Pressable key={name} accessibilityRole="tab" accessibilityLabel={options.title} accessibilityState={{selected:focused}} onPress={()=>go('/(tabs)/'+name)} style={{flex:1,alignItems:'center',justifyContent:'center',gap:2}}>{o.tabBarIcon({focused})}<Text style={[o.tabBarLabelStyle,{fontWeight:'normal',color:focused?o.tabBarActiveTintColor:o.tabBarInactiveTintColor}]}>{options.title}</Text></Pressable> })}
  </View>;
}
Tabs.Screen = () => null;
