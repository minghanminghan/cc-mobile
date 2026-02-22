import { useRef, useState } from 'react';
import { StyleSheet, StatusBar, Platform, View, TouchableOpacity, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

// In development, you usually need to point to your computer's local IP address
// Because the iOS Simulator / Android Emulator is running on a different network interface
// e.g., 'http://192.168.1.X:5173'
// Update this to your computer's actual local IPv4 address found via ipconfig/ifconfig
const WEB_APP_URL = 'http://192.168.1.133:5173';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

const VIRTUAL_KEYS: Array<{ label: string, value?: string, toggle?: 'ctrl' | 'alt' | 'shift' }> = [
    { label: 'ESC', value: '\x1b' },
    { label: 'TAB', value: '\t' },
    { label: 'CTRL', toggle: 'ctrl' },
    { label: 'ALT', toggle: 'alt' },
    { label: 'SHIFT', toggle: 'shift' },
    { label: 'DEL', value: '\x7f' },
    { label: 'UP', value: '\x1b[A' },
    { label: 'DOWN', value: '\x1b[B' },
    { label: 'LEFT', value: '\x1b[D' },
    { label: 'RIGHT', value: '\x1b[C' },
];

export default function TerminalScreen({ route, navigation }: Props) {
    const { profile } = route.params;
    const webviewRef = useRef<WebView>(null);
    const [ctrlActive, setCtrlActive] = useState(false);
    const [altActive, setAltActive] = useState(false);
    const [shiftActive, setShiftActive] = useState(false);

    // We inject the entire profile object (including passwords/private keys) into the window
    // The web app will read this on boot and immediately connect.
    const injectedJavaScript = `
    window.__INITIAL_PROFILE__ = ${JSON.stringify(profile)};
    true;
  `;

    const handleMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'DISCONNECT') {
                navigation.goBack();
            } else if (data.type === 'CONSUMED_MODIFIER') {
                if (data.modifier === 'ctrl') setCtrlActive(false);
                if (data.modifier === 'alt') setAltActive(false);
                if (data.modifier === 'shift') setShiftActive(false);
            }
        } catch (e) {
            // ignore JSON parse errors from other messages
        }
    };

    const handleKeyPress = (key: typeof VIRTUAL_KEYS[0]) => {
        if (key.toggle) {
            const isCtrl = key.toggle === 'ctrl';
            const isAlt = key.toggle === 'alt';

            let isActive = false;
            if (isCtrl) {
                isActive = !ctrlActive;
                setCtrlActive(isActive);
            } else if (isAlt) {
                isActive = !altActive;
                setAltActive(isActive);
            } else {
                isActive = !shiftActive;
                setShiftActive(isActive);
            }

            // Inject the modifier state directly into the window object
            const js = `
                window.__MODIFIER_${key.toggle.toUpperCase()}__ = ${isActive};
                true;
            `;
            webviewRef.current?.injectJavaScript(js);
        } else if (key.value) {
            const js = `
                if (window.__INJECT_TERMINAL_DATA__) {
                    window.__INJECT_TERMINAL_DATA__(${JSON.stringify(key.value)});
                }
                true;
            `;
            webviewRef.current?.injectJavaScript(js);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <WebView
                ref={webviewRef}
                source={{ uri: WEB_APP_URL }}
                style={styles.webview}
                injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
                onMessage={handleMessage}
                keyboardDisplayRequiresUserAction={false}
                bounces={false}
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                scalesPageToFit={Platform.OS === 'android'}
            />
            {/* Virtual Keyboard Row */}
            <View style={styles.keyboardRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keyboardScroll}>
                    {VIRTUAL_KEYS.map((k) => (
                        <TouchableOpacity
                            key={k.label}
                            style={[
                                styles.keyBtn,
                                (k.toggle === 'ctrl' && ctrlActive) && styles.keyBtnActive,
                                (k.toggle === 'alt' && altActive) && styles.keyBtnActive,
                                (k.toggle === 'shift' && shiftActive) && styles.keyBtnActive
                            ]}
                            onPress={() => handleKeyPress(k)}
                        >
                            <Text style={[
                                styles.keyText,
                                ((k.toggle === 'ctrl' && ctrlActive) ||
                                    (k.toggle === 'alt' && altActive) ||
                                    (k.toggle === 'shift' && shiftActive)) && styles.keyTextActive
                            ]}>{k.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#09090b', // match zinc-950 of the terminal background
    },
    webview: {
        flex: 1,
        backgroundColor: '#09090b',
    },
    keyboardRow: {
        backgroundColor: '#18181b', // zinc-900
        borderTopWidth: 1,
        borderTopColor: '#27272a', // zinc-800
        paddingVertical: 8,
    },
    keyboardScroll: {
        paddingHorizontal: 12,
        gap: 8,
    },
    keyBtn: {
        backgroundColor: '#27272a', // zinc-800
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    keyBtnActive: {
        backgroundColor: '#3b82f6', // blue-500
    },
    keyText: {
        color: '#e4e4e7', // zinc-200
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    keyTextActive: {
        color: '#ffffff',
    }
});
