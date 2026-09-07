import Foundation
import UIKit
import UserNotifications

/// Adaptador de push/background. FUNDAÇÃO, não funcionalidade.
///
/// O que este arquivo faz: registra em APNs quando (e somente quando) o usuário
/// já concedeu permissão, e entrega o device token ao backend existente.
///
/// O que este arquivo deliberadamente NÃO faz:
///   - não agenda despertador nem alerta operacional;
///   - não inventa conteúdo de notificação;
///   - não decide nada sobre escala, apresentação ou jornada.
///
/// Sem registro, sem token ou sem backend, o app segue plenamente utilizável: o
/// web já opera sem ponte nativa.
enum CrewCheckPushAdapter {
    /// Só registra se a permissão JÁ foi concedida. Registrar antes disso
    /// dispararia o diálogo do sistema num momento que o usuário não pediu.
    static func registerIfAuthorized() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized
                    || settings.authorizationStatus == .provisional else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    static func encode(deviceToken: Data) -> String {
        deviceToken.map { String(format: "%02x", $0) }.joined()
    }

    /// Encaminha o token ao backend. Falha é silenciosa por desenho: push é
    /// complemento, nunca pré-requisito de uso.
    static func submit(deviceToken: Data, baseURL: URL, authorization: String?) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/platform/devices"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let authorization, !authorization.isEmpty {
            request.setValue(authorization, forHTTPHeaderField: "authorization")
        }
        let body: [String: Any] = [
            "platform": "ios",
            "token": encode(deviceToken: deviceToken),
            // Sem identificador de usuário aqui: quem identifica é o header de
            // autorização já emitido pelo backend.
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        URLSession.shared.dataTask(with: request).resume()
    }

    /// Deep link vindo de uma notificação. A validação real é da allowlist do
    /// lado web; aqui só extraímos a URL, sem interpretá-la.
    static func deepLink(from userInfo: [AnyHashable: Any]) -> URL? {
        guard let raw = userInfo["crewcheckDeepLink"] as? String,
              let url = URL(string: raw),
              url.scheme?.lowercased() == "crewcheck" else { return nil }
        return url
    }
}
