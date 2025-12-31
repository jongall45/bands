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
    // Handle OAuth deep links
    App: {
      appUrlOpen: {
        schemes: ['bands'],
      },
    },
    // Browser plugin for external OAuth
    Browser: {
      // Use SFSafariViewController for OAuth flows
    },
  },
};

export default config;
