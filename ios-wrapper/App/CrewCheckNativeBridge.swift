import Foundation
import WebKit
import UIKit

/// Ponte WKWebView <-> web.
///
/// O lado web instala `window.CrewCheckNative` sozinho (ver
/// `client/src/lib/iosNativeRuntime.ts`) assim que detecta o handler
/// `crewcheckIos`. Aqui só tratamos as mensagens que chegam. Nenhuma regra de
/// escala, importação ou apresentação vive neste arquivo.
final class CrewCheckNativeBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "crewcheckIos"

    private weak var webView: WKWebView?
    private let permissions: CrewCheckPermissions

    init(webView: WKWebView, permissions: CrewCheckPermissions = CrewCheckPermissions()) {
        self.webView = webView
        self.permissions = permissions
    }

    static func install(on webView: WKWebView) -> CrewCheckNativeBridge {
        let bridge = CrewCheckNativeBridge(webView: webView)
        webView.configuration.userContentController.add(bridge, name: handlerName)
        return bridge
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              let body = message.body as? [String: Any],
              let name = body["name"] as? String else { return }
        let payload = body["payload"] as? [String: Any] ?? [:]

        switch name {
        case "openExternal":
            // Só http(s) — o lado web já filtra, mas a ponte não confia no cliente.
            guard let raw = payload["url"] as? String,
                  let url = URL(string: raw),
                  let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { return }
            UIApplication.shared.open(url)
        case "requestNotifications":
            permissions.requestNotifications { [weak self] granted in
                self?.publishPermission(key: "crewcheck_notifications_permission", granted: granted)
            }
        case "requestLocation", "requestCurrentLocation":
            permissions.requestLocation { [weak self] granted in
                self?.publishPermission(key: "crewcheck_location_permission", granted: granted)
            }
        case "acknowledgeSharedPdf":
            guard let shareId = payload["shareId"] as? String else { return }
            CrewCheckSharedInbox.acknowledge(shareId: shareId)
        default:
            // Mensagem desconhecida é ignorada em silêncio. Não logamos o corpo.
            break
        }
    }

    /// Grava o resultado real da permissão onde o web já lê, e avisa a UI.
    /// Nunca escreve `granted` sem concessão do sistema.
    private func publishPermission(key: String, granted: Bool) {
        let value = granted ? "granted" : "denied"
        evaluate("try{localStorage.setItem('\(key)','\(value)');window.dispatchEvent(new CustomEvent('crewcheck:permission-changed'));}catch(e){}")
    }

    /// Entrega um item da caixa de entrada para o pipeline de importação existente.
    func deliver(item: CrewCheckSharedInbox.Item) {
        let base64 = item.data.base64EncodedString()
        let name = CrewCheckSharedInbox.sanitize(fileName: item.fileName)
        // `receiveSharedPdf` valida de novo do lado web (tamanho, assinatura) e
        // publica `crewcheck:native-pdf`. Nenhum parser roda aqui.
        evaluate("""
        try{window.__crewcheckIosBridge&&window.__crewcheckIosBridge.receiveSharedPdf({\
        sourceFileName:\(jsString(name)),shareId:\(jsString(item.shareId)),dataBase64:\(jsString(base64))});}catch(e){}
        """)
    }

    func deliver(deepLink url: URL) {
        evaluate("try{window.__crewcheckIosBridge&&window.__crewcheckIosBridge.openDeepLink(\(jsString(url.absoluteString)));}catch(e){}")
    }

    /// Drena a caixa de entrada. Itens sem confirmação continuam lá.
    func drainSharedInbox() {
        for item in CrewCheckSharedInbox.pending() { deliver(item: item) }
    }

    private func evaluate(_ script: String) {
        DispatchQueue.main.async { [weak webView] in
            webView?.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    /// Serializa como literal JS. Evita concatenação ingênua de string.
    private func jsString(_ value: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: [value], options: [])) ?? Data("[\"\"]".utf8)
        let array = String(decoding: data, as: UTF8.self)
        return String(array.dropFirst().dropLast())
    }
}
