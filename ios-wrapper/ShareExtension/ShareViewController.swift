import UIKit
import UniformTypeIdentifiers

/// Share Extension: recebe o PDF do Files/Share Sheet e o deposita na caixa de
/// entrada do App Group. Não interpreta o arquivo, não fala com a WebView e não
/// conhece nada de escala — o parser continua sendo o do app.
final class ShareViewController: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        handleSharedItem()
    }

    private func handleSharedItem() {
        guard let item = (extensionContext?.inputItems as? [NSExtensionItem])?.first,
              let provider = item.attachments?.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) })
        else { return finish(accepted: false) }

        provider.loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { [weak self] url, _ in
            guard let url, let data = try? Data(contentsOf: url) else { return self?.finish(accepted: false) ?? () }
            let shareId = CrewCheckSharedInbox.write(data: data, fileName: url.lastPathComponent)
            self?.finish(accepted: shareId != nil, shareId: shareId)
        }
    }

    private func finish(accepted: Bool, shareId: String? = nil) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if accepted, let shareId {
                // Abre o app na importação. O `shareId` só deduplica; a entrega do
                // conteúdo é pela caixa de entrada, nunca pela URL.
                if let url = URL(string: "crewcheck://import?shareId=\(shareId)") {
                    self.openHostApp(url)
                }
            }
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    /// Abertura do app hospedeiro a partir da extensão.
    private func openHostApp(_ url: URL) {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.perform(#selector(UIApplication.open(_:options:completionHandler:)), with: url, with: [:])
                return
            }
            responder = current.next
        }
    }
}
