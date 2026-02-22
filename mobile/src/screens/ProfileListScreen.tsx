import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Terminal, Edit2, Trash2 } from 'lucide-react-native';
import { loadProfiles, deleteProfile, type Profile } from '../lib/profiles';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileList'>;

export default function ProfileListScreen({ navigation }: Props) {
    const [profiles, setProfiles] = useState<Profile[]>([]);

    const fetchProfiles = () => loadProfiles().then(setProfiles);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', fetchProfiles);
        return unsubscribe;
    }, [navigation]);

    const handleDelete = (id: string, name: string) => {
        Alert.alert(
            'Delete Connection',
            `Are you sure you want to delete "${name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteProfile(id);
                        fetchProfiles();
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Projects</Text>
                <TouchableOpacity
                    style={styles.headerBtn}
                    onPress={() => navigation.navigate('ProfileForm', {})}
                >
                    <Text style={styles.headerBtnText}>New Project</Text>
                </TouchableOpacity>
            </View>

            {profiles.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No saved projects yet.</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('ProfileForm', {})}>
                        <Text style={styles.emptyLink}>Create your first project</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={profiles}
                    keyExtractor={p => p.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                                <View style={styles.cardActionsRow}>
                                    <TouchableOpacity
                                        style={styles.iconBtn}
                                        onPress={() => navigation.navigate('ProfileForm', { profile: item })}
                                    >
                                        <Edit2 color="#71717a" size={18} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.iconBtn}
                                        onPress={() => handleDelete(item.id, item.name)}
                                    >
                                        <Trash2 color="#71717a" size={18} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <Text style={styles.cardSubtitle} numberOfLines={1}>
                                {item.username}@{item.host}:{item.port}
                            </Text>
                            {item.projectPath && (
                                <Text style={styles.cardProjectPath} numberOfLines={1}>
                                    ↳ {item.projectPath}
                                </Text>
                            )}

                            <TouchableOpacity
                                style={styles.connectButton}
                                onPress={() => navigation.navigate('Terminal', { profile: item })}
                            >
                                <Text style={styles.connectButtonText}>Connect</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000', // matches web bg-black
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#27272a'
    },
    headerTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '600',
        letterSpacing: -0.5,
    },
    headerBtn: {
        backgroundColor: '#fff',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 4,
    },
    headerBtnText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '500',
    },
    emptyState: {
        margin: 20,
        padding: 40,
        borderWidth: 1,
        borderColor: '#27272a',
        borderStyle: 'dashed',
        borderRadius: 8,
        alignItems: 'center',
    },
    emptyText: {
        color: '#71717a',
        marginBottom: 12,
    },
    emptyLink: {
        color: '#fff',
        textDecorationLine: 'underline',
    },
    listContent: {
        padding: 20,
        gap: 16,
    },
    card: {
        backgroundColor: '#09090b', // zinc-950
        borderRadius: 8,
        padding: 20,
        borderWidth: 1,
        borderColor: '#27272a', // zinc-800
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    cardTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
        flex: 1,
        marginRight: 12,
    },
    cardActionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    iconBtn: {
        padding: 4,
    },
    cardSubtitle: {
        color: '#a1a1aa', // zinc-400
        fontSize: 14,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginBottom: 8,
    },
    cardProjectPath: {
        fontSize: 13,
        color: '#71717a',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginBottom: 12,
    },
    connectButton: {
        backgroundColor: '#27272a', // zinc-800
        width: '100%',
        paddingVertical: 12,
        borderRadius: 4,
        alignItems: 'center',
    },
    connectButtonText: {
        color: '#e4e4e7', // zinc-200
        fontSize: 14,
        fontWeight: '500',
    }
});
