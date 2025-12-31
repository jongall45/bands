import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cash.bands.app',
  appName: 'bands',
  webDir: 'out',

  // Point to production URL - no local build needed!
  // Change to your staging URL for testing: 'https://bands-staging.vercel.app'
  server: {
    // Use www version - site redirects bands.cash → www.bands.cash
    url: 'https://www.bands.cash',
    cleartext: false,
    // CRITICAL: Allow navigation to these domains to prevent Safari redirect
    allowNavigation: [
      'bands.cash',
      'www.bands.cash',
      '*.privy.io',
      'auth.privy.io',
      '*.google.com',
      'accounts.google.com',
      '*.apple.com',
      'appleid.apple.com',
    ],
  },

  ios: {
    // Use HTTPS scheme for production (prevents Safari redirect issues)
    scheme: 'https',
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
