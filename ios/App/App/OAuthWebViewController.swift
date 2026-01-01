import UIKit
import WebKit
import Capacitor
import AuthenticationServices

/// Custom Bridge View Controller that intercepts OAuth navigation at the WKWebView level
/// This catches OAuth URLs from Privy's iframe that JavaScript can't intercept
class OAuthWebViewController: CAPBridgeViewController, WKNavigationDelegate, ASWebAuthenticationPresentationContextProviding {

    private var authSession: ASWebAuthenticationSession?
    private var originalDelegate: WKNavigationDelegate?

    // OAuth domains to intercept
    private let oauthDomains = [
        "accounts.google.com",
        "appleid.apple.com"
    ]

    override func viewDidLoad() {
        super.viewDidLoad()

        print("[OAuthWebVC] viewDidLoad - Setting up OAuth interception")

        // Set ourselves as the navigation delegate to intercept ALL navigation
        // Store the original delegate so we can forward non-OAuth requests
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.setupNavigationDelegate()
        }
    }

    private func setupNavigationDelegate() {
        guard let webView = self.webView else {
            print("[OAuthWebVC] ERROR: webView is nil")
            return
        }

        print("[OAuthWebVC] Setting up WKNavigationDelegate")
        originalDelegate = webView.navigationDelegate
        webView.navigationDelegate = self

        // Also set UI delegate to catch window.open calls
        webView.uiDelegate = self

        print("[OAuthWebVC] Navigation delegate setup complete")
    }

    // MARK: - OAuth URL Detection

    private func isOAuthURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        let isOAuth = oauthDomains.contains { domain in
            host == domain || host.hasSuffix("." + domain)
        }
        if isOAuth {
            print("[OAuthWebVC] Detected OAuth URL: \(url.absoluteString)")
        }
        return isOAuth
    }

    // MARK: - ASWebAuthenticationSession

    private func startOAuthSession(url: URL) {
        print("[OAuthWebVC] Starting ASWebAuthenticationSession for: \(url.absoluteString)")

        authSession = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "bands"
        ) { [weak self] callbackURL, error in
            if let error = error as? ASWebAuthenticationSessionError {
                if error.code == .canceledLogin {
                    print("[OAuthWebVC] User cancelled OAuth")
                } else {
                    print("[OAuthWebVC] OAuth error: \(error.localizedDescription)")
                }
                return
            }

            guard let callbackURL = callbackURL else {
                print("[OAuthWebVC] No callback URL received")
                return
            }

            print("[OAuthWebVC] OAuth callback received: \(callbackURL.absoluteString)")
            self?.handleOAuthCallback(callbackURL)
        }

        authSession?.presentationContextProvider = self
        authSession?.prefersEphemeralWebBrowserSession = false

        DispatchQueue.main.async { [weak self] in
            guard let session = self?.authSession else { return }
            if !session.start() {
                print("[OAuthWebVC] Failed to start ASWebAuthenticationSession")
            } else {
                print("[OAuthWebVC] ASWebAuthenticationSession started successfully")
            }
        }
    }

    private func handleOAuthCallback(_ url: URL) {
        print("[OAuthWebVC] Handling OAuth callback")

        // Inject the OAuth params back into the webview
        guard let webView = self.webView else { return }

        // Get the current URL and append OAuth params
        let js = """
        (function() {
            const params = new URLSearchParams('\(url.query ?? "")');
            const currentUrl = new URL(window.location.href);
            params.forEach((value, key) => currentUrl.searchParams.set(key, value));
            console.log('[OAuthWebVC] Redirecting to:', currentUrl.toString());
            window.location.href = currentUrl.toString();
        })();
        """

        DispatchQueue.main.async {
            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    print("[OAuthWebVC] JS injection error: \(error)")
                } else {
                    print("[OAuthWebVC] OAuth params injected successfully")
                }
            }
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        print("[OAuthWebVC] Navigation request: \(url.absoluteString.prefix(100))...")

        // Check if this is an OAuth URL
        if isOAuthURL(url) {
            print("[OAuthWebVC] INTERCEPTING OAuth URL - opening in ASWebAuthenticationSession")
            decisionHandler(.cancel)
            startOAuthSession(url: url)
            return
        }

        // Forward to original delegate or allow
        if let original = originalDelegate {
            original.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        print("[OAuthWebVC] Started navigation")
        originalDelegate?.webView?(webView, didStartProvisionalNavigation: navigation)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[OAuthWebVC] Finished navigation")
        originalDelegate?.webView?(webView, didFinish: navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[OAuthWebVC] Navigation failed: \(error.localizedDescription)")
        originalDelegate?.webView?(webView, didFail: navigation, withError: error)
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return view.window ?? ASPresentationAnchor()
    }
}

// MARK: - WKUIDelegate for window.open interception

extension OAuthWebViewController: WKUIDelegate {

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {

        guard let url = navigationAction.request.url else {
            return nil
        }

        print("[OAuthWebVC] window.open detected: \(url.absoluteString.prefix(100))...")

        if isOAuthURL(url) {
            print("[OAuthWebVC] INTERCEPTING window.open OAuth URL")
            startOAuthSession(url: url)
            return nil
        }

        // For non-OAuth URLs, load in the same webview
        webView.load(navigationAction.request)
        return nil
    }
}
