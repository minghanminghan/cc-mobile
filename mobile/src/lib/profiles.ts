import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type AuthType = 'password' | 'key'

export interface Profile {
    id: string
    name: string
    host: string
    port: number
    username: string
    authType: AuthType
    password?: string
    privateKey?: string
    projectPath?: string
}

const STORAGE_KEY = 'cc-profiles'

export async function loadProfiles(): Promise<Profile[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const profiles: Profile[] = JSON.parse(raw)

        // Decrypt and load secrets
        const fullProfiles = await Promise.all(
            profiles.map(async (p) => {
                try {
                    const secretRaw = await SecureStore.getItemAsync(`profile-${p.id}-secret`)
                    if (secretRaw) {
                        const secret = JSON.parse(secretRaw)
                        return { ...p, ...secret }
                    }
                } catch (e) {
                    console.error(`Failed to load secrets for profile ${p.id}`, e)
                }
                return p
            })
        )
        return fullProfiles
    } catch (e) {
        console.error('Failed to load profiles', e)
        return []
    }
}

export async function saveProfiles(profiles: Profile[]) {
    try {
        const metadataList = profiles.map(p => {
            const { password, privateKey, ...metadata } = p
            return metadata
        })

        // Save metadata
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(metadataList))

        // Save secrets securely
        await Promise.all(
            profiles.map(async (p) => {
                const secret: any = {}
                if (p.password) secret.password = p.password
                if (p.privateKey) secret.privateKey = p.privateKey

                if (Object.keys(secret).length > 0) {
                    await SecureStore.setItemAsync(`profile-${p.id}-secret`, JSON.stringify(secret))
                } else {
                    await SecureStore.deleteItemAsync(`profile-${p.id}-secret`).catch(() => { })
                }
            })
        )
    } catch (e) {
        console.error('Failed to save profiles', e)
        throw e
    }
}

export async function addProfile(profile: Omit<Profile, 'id'>): Promise<Profile> {
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
    const newProfile = { ...profile, id: generateId() }
    const profiles = await loadProfiles()
    profiles.push(newProfile)
    await saveProfiles(profiles)
    return newProfile
}

export async function updateProfile(id: string, updates: Partial<Profile>) {
    const profiles = await loadProfiles()
    const idx = profiles.findIndex(p => p.id === id)
    if (idx !== -1) {
        profiles[idx] = { ...profiles[idx], ...updates }
        await saveProfiles(profiles)
    }
}

export async function deleteProfile(id: string) {
    const profiles = await loadProfiles()
    const filtered = profiles.filter(p => p.id !== id)
    await saveProfiles(filtered)
    await SecureStore.deleteItemAsync(`profile-${id}-secret`).catch(() => { })
}
