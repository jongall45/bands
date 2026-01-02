import UIKit
import WebKit
import Capacitor
import SafariServices

/**
 * PopupWebViewController - Custom Capacitor ViewController that handles popup windows
 *
 * iOS WKWebView blocks new window requests (window.open, target="_blank") by default.
 * This is a security feature, but it breaks Privy's MoonPay integration which uses
 * iframes that need to open new windows for authentication (Apple Pay, card auth).
 *
 * This controller implements WKUIDelegate to intercept new window requests and
 * opens them in SFSafariViewController, where Apple Pay and other auth flows work.
 */
class PopupWebViewController: CAPBridgeViewController, WKUIDelegate {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Set ourselves as the WKUIDelegate to handle popup requests
        webView?.uiDelegate = self

        print("[PopupWebViewController] Configured WKUIDelegate for popup handling")
    }

    // MARK: - WKUIDelegate - Handle new window requests

    /**
     * Called when JavaScript tries to open a new window (window.open, target="_blank", etc.)
     * Instead of blocking, we open the URL in SFSafariViewController.
     */
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {

        guard let url = navigationAction.request.url else {
            print("[PopupWebViewController] No URL in navigation action")
            return nil
        }

        let urlString = url.absoluteString
        print("[PopupWebViewController] Intercepted new window request: \(urlString)")

        // Only handle HTTP and HTTPS URLs - SFSafariViewController only supports these
        // Ignore javascript:, about:blank, data:, and other schemes
        guard let scheme = url.scheme?.lowercased(),
              (scheme == "http" || scheme == "https") else {
            print("[PopupWebViewController] Ignoring non-HTTP URL scheme: \(url.scheme ?? "none")")
            return nil
        }

        // Open in SFSafariViewController (same as Capacitor's Browser plugin)
        // This allows Apple Pay, Sign in with Apple, and other auth flows to work
        DispatchQueue.main.async {
            self.openInSafariViewController(url: url)
        }

        // Return nil to prevent WKWebView from creating a new web view
        // The URL is handled by SFSafariViewController instead
        return nil
    }

    // MARK: - Safari View Controller

    private func openInSafariViewController(url: URL) {
        let safariVC = SFSafariViewController(url: url)
        safariVC.preferredBarTintColor = UIColor.black
        safariVC.preferredControlTintColor = UIColor.white
        safariVC.dismissButtonStyle = .close
        safariVC.delegate = self

        present(safariVC, animated: true, completion: nil)
        print("[PopupWebViewController] Opened URL in SFSafariViewController")
    }
}

// MARK: - SFSafariViewControllerDelegate

extension PopupWebViewController: SFSafariViewControllerDelegate {

    func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        print("[PopupWebViewController] Safari view controller dismissed")

        // Notify the web view that the browser was closed
        // This allows the app to refresh balances, etc.
        webView?.evaluateJavaScript("""
            window.dispatchEvent(new CustomEvent('capacitor-browser-closed'));
        """, completionHandler: nil)
    }
}
