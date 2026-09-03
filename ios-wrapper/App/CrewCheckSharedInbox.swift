import Foundation

/// Caixa de entrada compartilhada entre o app e a Share Extension.
///
/// A extensão NÃO fala com a WebView (processos separados). Ela grava o PDF num
/// container de App Group e o app drena essa caixa quando abre ou volta ao
/// primeiro plano.
///
/// O item só é removido quando a camada web confirma o consumo
/// (`acknowledgeSharedPdf`). Isso é o que impede publicação duplicada quando o
/// app é morto no meio da importação: sem confirmação, o item continua lá e é
/// reapresentado; com confirmação, some. O dedupe dentro da sessão continua
/// sendo do Home, por `shareId`.
enum CrewCheckSharedInbox {
    /// Precisa bater com o App Group configurado no target do app E da extensão.
    static let appGroupIdentifier = "group.com.crewcheck.app"
    private static let inboxFolder = "SharedInbox"
    private static let maxBytes = 20 * 1024 * 1024

    struct Item {
        let shareId: String
        let fileName: String
        let data: Data
    }

    private static func inboxURL() -> URL? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else { return nil }
        let folder = container.appendingPathComponent(inboxFolder, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    /// Nome seguro: sem diretório, sem caractere de controle, sempre `.pdf`.
    static func sanitize(fileName raw: String) -> String {
        let base = (raw as NSString).lastPathComponent
        let allowed = base.unicodeScalars.filter { $0.value >= 32 && $0.value != 127 }
        var clean = String(String.UnicodeScalarView(allowed))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        while clean.hasPrefix(".") { clean.removeFirst() }
        if clean.isEmpty { clean = "CrewCheck-escala.pdf" }
        if clean.count > 120 { clean = String(clean.prefix(120)) }
        return clean.lowercased().hasSuffix(".pdf") ? clean : clean + ".pdf"
    }

    /// Aceita apenas PDF real dentro do limite. Recusa antes de gravar.
    static func isAcceptable(_ data: Data) -> Bool {
        guard !data.isEmpty, data.count <= maxBytes, data.count >= 5 else { return false }
        return data.prefix(5).elementsEqual(Array("%PDF-".utf8))
    }

    @discardableResult
    static func write(data: Data, fileName: String) -> String? {
        guard isAcceptable(data), let folder = inboxURL() else { return nil }
        let shareId = UUID().uuidString
        let safeName = sanitize(fileName: fileName)
        let target = folder.appendingPathComponent(shareId, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
            try data.write(to: target.appendingPathComponent(safeName), options: .atomic)
            return shareId
        } catch {
            // Falha de escrita não pode derrubar a extensão; o usuário reabre e
            // importa manualmente. Nada do conteúdo vai para log.
            return nil
        }
    }

    static func pending() -> [Item] {
        guard let folder = inboxURL(),
              let ids = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return [] }
        return ids.sorted().compactMap { shareId in
            let dir = folder.appendingPathComponent(shareId, isDirectory: true)
            guard let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path),
                  let name = names.first,
                  let data = try? Data(contentsOf: dir.appendingPathComponent(name)),
                  isAcceptable(data) else { return nil }
            return Item(shareId: shareId, fileName: name, data: data)
        }
    }

    /// Chamada quando a camada web confirma que importou.
    static func acknowledge(shareId: String) {
        // `shareId` chega da WebView com o prefixo `ios:`; só o sufixo é caminho.
        let raw = shareId.hasPrefix("ios:") ? String(shareId.dropFirst(4)) : shareId
        guard UUID(uuidString: raw) != nil, let folder = inboxURL() else { return }
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(raw, isDirectory: true))
    }
}
