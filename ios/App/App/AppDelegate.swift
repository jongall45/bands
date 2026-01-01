import UIKit
import Capacitor
import AuthenticationServices
import SafariServices
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    var authSession: ASWebAuthenticationSession?

    // OAuth domains to intercept
    let oauthDomains = ["accounts.google.com", "appleid.apple.com"]

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Set up OAuth URL interception after a short delay to ensure WebView is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.setupOAuthInterception()
        }
        return true
    }

    /// Sets up interception of OAuth URLs at the native WebView level
    func setupOAuthInterception() {
        guard let rootVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = rootVC.webView else {
            print("[OAuth] Could not get webView")
            return
        }

        // Inject JavaScript to intercept OAuth URLs
        let script = """
        (function() {
            if (window.__oauthInterceptorInstalled) return;
            window.__oauthInterceptorInstalled = true;

            const oauthDomains = ['accounts.google.com', 'appleid.apple.com', 'auth.privy.io'];

            function isOAuthURL(url) {
                try {
                    const urlObj = new URL(url, window.location.origin);
                    return oauthDomains.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d));
                } catch(e) { return false; }
            }

            // Override window.open
            const originalOpen = window.open;
            window.open = function(url, target, features) {
                if (url && isOAuthURL(url)) {
                    console.log('[OAuth] Intercepting window.open:', url);
                    window.webkit.messageHandlers.oauthHandler.postMessage(url);
                    return { closed: false, close: function(){}, focus: function(){}, blur: function(){} };
                }
                return originalOpen.call(window, url, target, features);
            };

            console.log('[OAuth] Native interception installed');
        })();
        """

        webView.configuration.userContentController.removeAllUserScripts()

        let userScript = WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(userScript)

        // Add message handler
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "oauthHandler")
        webView.configuration.userContentController.add(OAuthMessageHandler(appDelegate: self), name: "oauthHandler")

        print("[OAuth] Interception setup complete")
    }

    /// Opens OAuth URL in SFSafariViewController (system browser sheet)
    func openOAuthInSafari(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }

        print("[OAuth] Opening in SFSafariViewController: \(urlString)")

        DispatchQueue.main.async {
            let safariVC = SFSafariViewController(url: url)
            safariVC.modalPresentationStyle = .pageSheet

            if let rootVC = self.window?.rootViewController {
                rootVC.present(safariVC, animated: true)
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - OAuth Message Handler

/// Handles messages from JavaScript when OAuth URLs are intercepted
class OAuthMessageHandler: NSObject, WKScriptMessageHandler {
    weak var appDelegate: AppDelegate?

    init(appDelegate: AppDelegate) {
        self.appDelegate = appDelegate
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let urlString = message.body as? String else { return }
        print("[OAuth] Received from JS: \(urlString)")
        appDelegate?.openOAuthInSafari(urlString)
    }
}
