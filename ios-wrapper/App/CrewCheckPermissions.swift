import Foundation
import CoreLocation
import UserNotifications

/// Permissões nativas. Cada método pede ao sistema e devolve o resultado REAL.
/// Nada aqui presume concessão nem entrega comportamento quando a permissão é
/// negada — negar precisa manter o app utilizável, pelo caminho web.
final class CrewCheckPermissions: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private var locationCallback: ((Bool) -> Void)?

    func requestNotifications(_ completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async { completion(granted) }
        }
    }

    func requestLocation(_ completion: @escaping (Bool) -> Void) {
        locationCallback = completion
        locationManager.delegate = self
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            finishLocation(true)
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        default:
            finishLocation(false)
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: finishLocation(true)
        case .notDetermined: break
        default: finishLocation(false)
        }
    }

    private func finishLocation(_ granted: Bool) {
        let callback = locationCallback
        locationCallback = nil
        DispatchQueue.main.async { callback?(granted) }
    }
}
