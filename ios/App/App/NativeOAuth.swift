import Foundation
import AuthenticationServices
import Capacitor

@objc(NativeOAuth)
public class NativeOAuth: CAPPlugin, ASWebAuthenticationPresentationContextProviding {

    private var authSession: ASWebAuthenticationSession?

    /// Start OAuth flow in ASWebAuthenticationSession (system browser)
    @objc func startOAuth(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }

        let callbackScheme = call.getString("callbackScheme") ?? "bands"

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.authSession = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let error = error as? ASWebAuthenticationSessionError {
                    if error.code == .canceledLogin {
                        call.reject("User cancelled")
                    } else {
                        call.reject("Auth error: \(error.localizedDescription)")
                    }
                    return
                }

                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else {
                    call.reject("No callback URL received")
                }
            }

            self.authSession?.presentationContextProvider = self
            self.authSession?.prefersEphemeralWebBrowserSession = false

            if !self.authSession!.start() {
                call.reject("Failed to start auth session")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return UIApplication.shared.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
