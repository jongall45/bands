import { registerPlugin } from '@capacitor/core'

export interface NativeOAuthPlugin {
  startOAuth(options: { url: string; callbackScheme?: string }): Promise<{ url: string }>
}

const NativeOAuth = registerPlugin<NativeOAuthPlugin>('NativeOAuth')

export default NativeOAuth
