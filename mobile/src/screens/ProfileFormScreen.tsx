import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addProfile, updateProfile, deleteProfile } from '../lib/profiles';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileForm'>;

export default function ProfileFormScreen({ route, navigation }: Props) {
    const profile = route.params?.profile;
    const isEditing = !!profile;

    const [name, setName] = useState(profile?.name || '');
    const [host, setHost] = useState(profile?.host || '');
    const [port, setPort] = useState(profile?.port?.toString() || '22');
    const [username, setUsername] = useState(profile?.username || '');
    const [authType, setAuthType] = useState<'password' | 'key'>(profile?.authType || 'password');
    const [password, setPassword] = useState(profile?.password || '');
    const [privateKey, setPrivateKey] = useState(profile?.privateKey || '');
    const [projectPath, setProjectPath] = useState(profile?.projectPath || '');
    const [saveProfile, setSaveProfile] = useState(true);

    const handleSave = async (connectAfter: boolean = false) => {
        if (!host || !username) return; // name is optional now, like web

        const data = {
            name: name || `${username}@${host}`,
            host, port: parseInt(port) || 22, username, authType,
            password: authType === 'password' ? password : undefined,
            privateKey: authType === 'key' ? privateKey : undefined,
            projectPath: projectPath.trim() || undefined
        };

        let savedProfile;
        if (saveProfile) {
            if (isEditing) {
                await updateProfile(profile.id, data);
                savedProfile = { ...profile, ...data };
            } else {
                savedProfile = await addProfile(data as any);
            }
        } else {
            // Transient profile
            savedProfile = { ...data, id: isEditing ? profile.id : 'transient-' + Date.now() };
        }

        if (connectAfter) {
            // Replace the current screen with the Terminal screen to prevent backstack issues
            navigation.replace('Terminal', { profile: savedProfile });
        } else {
            if (!saveProfile) return; // Cannot just 'Save' a transient profile without connecting
            navigation.goBack();
        }
    };

    const handleDelete = async () => {
        if (profile) {
            await deleteProfile(profile.id);
            navigation.goBack();
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>

                <View style={styles.card}>
                    <Text style={styles.label}>PROFILE NAME (OPTIONAL)</Text>
                    <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="My Server" placeholderTextColor="#52525b" />

                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>HOST</Text>
                            <TextInput style={styles.input} value={host} onChangeText={setHost} placeholder="192.168.1.1" placeholderTextColor="#52525b" autoCapitalize="none" autoCorrect={false} />
                        </View>
                        <View style={[styles.col, { flex: 0.3 }]}>
                            <Text style={styles.label}>PORT</Text>
                            <TextInput style={styles.input} value={port} onChangeText={setPort} keyboardType="numeric" placeholderTextColor="#52525b" />
                        </View>
                    </View>

                    <Text style={styles.label}>USERNAME</Text>
                    <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="ubuntu" placeholderTextColor="#52525b" autoCapitalize="none" autoCorrect={false} />

                    <Text style={styles.label}>PROJECT PATH (OPTIONAL)</Text>
                    <TextInput style={styles.input} value={projectPath} onChangeText={setProjectPath} placeholder="/var/www/my-app" placeholderTextColor="#52525b" autoCapitalize="none" autoCorrect={false} />

                    <Text style={styles.label}>AUTH</Text>
                    <View style={styles.segmentedControl}>
                        <TouchableOpacity
                            style={[styles.segmentBtn, authType === 'password' && styles.segmentBtnActive]}
                            onPress={() => setAuthType('password')}
                        >
                            <Text style={[styles.segmentText, authType === 'password' && styles.segmentTextActive]}>Password</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.segmentBtn, authType === 'key' && styles.segmentBtnActive]}
                            onPress={() => setAuthType('key')}
                        >
                            <Text style={[styles.segmentText, authType === 'key' && styles.segmentTextActive]}>Private Key</Text>
                        </TouchableOpacity>
                    </View>

                    {authType === 'password' ? (
                        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor="#52525b" autoCapitalize="none" />
                    ) : (
                        <TextInput
                            style={[styles.input, styles.textarea]}
                            value={privateKey}
                            onChangeText={setPrivateKey}
                            multiline
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholderTextColor="#52525b"
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                        />
                    )}

                    <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>Save Connection Profile</Text>
                        <Switch
                            value={saveProfile}
                            onValueChange={setSaveProfile}
                            trackColor={{ false: '#3f3f46', true: '#fff' }}
                            thumbColor={saveProfile ? '#000' : '#a1a1aa'}
                        />
                    </View>
                </View>

                <View style={styles.buttonRow}>
                    <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => navigation.goBack()}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    {saveProfile && (
                        <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={() => handleSave(false)}>
                            <Text style={styles.saveBtnText}>Save</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity style={styles.connectBtn} onPress={() => handleSave(true)}>
                    <Text style={styles.connectBtnText}>{saveProfile ? (isEditing ? 'Save & Connect' : 'Save & Connect') : 'Connect'}</Text>
                </TouchableOpacity>

                {isEditing && (
                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                        <Text style={styles.deleteBtnText}>Delete Connection</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    scroll: { padding: 16 },
    card: {
        backgroundColor: '#09090b', // zinc-950
        borderWidth: 1,
        borderColor: '#27272a', // zinc-800
        borderRadius: 8,
        padding: 20,
        marginBottom: 16,
    },
    label: {
        color: '#a1a1aa',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
        letterSpacing: 0.5
    },
    input: {
        backgroundColor: '#18181b', // zinc-900
        borderWidth: 1,
        borderColor: '#3f3f46', // zinc-700
        borderRadius: 4,
        padding: 12,
        color: '#fff',
        marginBottom: 16,
        fontSize: 14,
    },
    textarea: { height: 120, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    row: { flexDirection: 'row', gap: 12 },
    col: { flex: 1 },
    segmentedControl: {
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: '#3f3f46',
        borderRadius: 4,
        marginBottom: 16,
        overflow: 'hidden',
    },
    segmentBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: '#18181b' // zinc-900
    },
    segmentBtnActive: {
        backgroundColor: '#3f3f46' // zinc-700
    },
    segmentText: {
        color: '#a1a1aa', // zinc-400
        fontSize: 14,
    },
    segmentTextActive: {
        color: '#fff'
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingVertical: 4,
    },
    switchLabel: {
        color: '#a1a1aa',
        fontSize: 14,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    btn: {
        flex: 1,
        padding: 14,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtn: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#3f3f46'
    },
    cancelBtnText: { color: '#d4d4d8', fontWeight: '500', fontSize: 14 },
    saveBtn: { backgroundColor: '#3f3f46' }, // zinc-700
    saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    connectBtn: { backgroundColor: '#fff', padding: 14, borderRadius: 4, alignItems: 'center', marginBottom: 16 },
    connectBtnText: { color: '#000', fontWeight: '600', fontSize: 14 },
    deleteBtn: { padding: 16, borderRadius: 4, alignItems: 'center', backgroundColor: '#ef444410', borderWidth: 1, borderColor: '#ef444430' },
    deleteBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
});
