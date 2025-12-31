import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cash.bands.app',
  appName: 'bands',
  webDir: 'out',

  // Point to production URL - no local build needed!
  // Change to your staging URL for testing: 'https://bands-staging.vercel.app'
  server: {
    url: 'https://bands.cash',
    cleartext: false,
    // Allow navigation to OAuth provider domains
    allowNavigation: [
      'https://bands.cash/*',
      'https://*.privy.io/*',
      'https://auth.privy.io/*',
      'https://accounts.google.com/*',
      'https://appleid.apple.com/*',
    ],
  },

  ios: {
    // URL scheme for OAuth callbacks
    scheme: 'bands',
    // Handle safe area insets automatically
    contentInset: 'automatic',
    // Disable link preview (cleaner UX)
    allowsLinkPreview: false,
    // Enable smooth scrolling
    scrollEnabled: true,
    // Use WKWebView (default, best performance)
    preferredContentMode: 'mobile',
    // Background color while loading
    backgroundColor: '#000000',
  },

  plugins: {
    // Browser plugin for OAuth flows (uses SFSafariViewController on iOS)
    Browser: {},
  },
};

export default config;
