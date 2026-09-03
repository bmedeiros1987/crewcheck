import Foundation
import EventKit

/// Adaptador de calendário — SOMENTE a camada de capacidade.
///
/// O CrewCheck já exporta escala por ICS e integra com Google Calendar no lado
/// web (`calendarExport.ts`, `googleCalendarSync.ts`). Esta fundação não duplica
/// nem altera nenhuma dessas regras: ela apenas expõe se o calendário nativo
/// está disponível e autorizado, para uma integração futura.
///
/// Nenhum evento é criado, lido ou modificado aqui.
enum CrewCheckCalendarAdapter {
    enum Availability { case unavailable, notDetermined, denied, authorized }

    static func availability() -> Availability {
        if #available(iOS 17.0, *) {
            switch EKEventStore.authorizationStatus(for: .event) {
            case .notDetermined: return .notDetermined
            case .fullAccess, .writeOnly: return .authorized
            case .denied, .restricted: return .denied
            @unknown default: return .unavailable
            }
        }
        switch EKEventStore.authorizationStatus(for: .event) {
        case .notDetermined: return .notDetermined
        case .authorized: return .authorized
        case .denied, .restricted: return .denied
        @unknown default: return .unavailable
        }
    }

    /// Pede acesso de ESCRITA apenas. O app não precisa ler a agenda do usuário
    /// para publicar a escala — permissão mínima.
    static func requestWriteAccess(_ completion: @escaping (Bool) -> Void) {
        let store = EKEventStore()
        if #available(iOS 17.0, *) {
            store.requestWriteOnlyAccessToEvents { granted, _ in
                DispatchQueue.main.async { completion(granted) }
            }
        } else {
            store.requestAccess(to: .event) { granted, _ in
                DispatchQueue.main.async { completion(granted) }
            }
        }
    }
}
