import CoreLocation

/// Where the person is, for the Near me map. Used on the phone only: never stored and never sent anywhere (CLAUDE.md rule 4).
nonisolated enum LocationOutcome: Equatable, Sendable {
    case found(latitude: Double, longitude: Double)
    case denied
    case unavailable
}

protocol LocationProviding {
    /// `onlyIfAllowed`: answer only if the person already said yes (opening the map); never shows the system prompt.
    func currentLocation(onlyIfAllowed: Bool) async -> LocationOutcome
}

/// Core Location, "while using the app", about 100 m accuracy (enough to sort nearby branches).
final class CoreLocationService: NSObject, LocationProviding {
    private let manager = CLLocationManager()
    private var authorizationWaiters: [CheckedContinuation<Void, Never>] = []
    private var locationWaiters: [CheckedContinuation<LocationOutcome, Never>] = []

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func currentLocation(onlyIfAllowed: Bool) async -> LocationOutcome {
        if manager.authorizationStatus == .notDetermined {
            if onlyIfAllowed { return .denied }
            await withCheckedContinuation { continuation in
                authorizationWaiters.append(continuation)
                manager.requestWhenInUseAuthorization()
            }
        }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            return await withCheckedContinuation { continuation in
                locationWaiters.append(continuation)
                manager.requestLocation()
            }
        default:
            return .denied
        }
    }

    private func finishLocation(_ outcome: LocationOutcome) {
        let waiters = locationWaiters
        locationWaiters = []
        waiters.forEach { $0.resume(returning: outcome) }
    }
}

extension CoreLocationService: @preconcurrency CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard manager.authorizationStatus != .notDetermined else { return }
        let waiters = authorizationWaiters
        authorizationWaiters = []
        waiters.forEach { $0.resume() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        finishLocation(.found(latitude: last.coordinate.latitude, longitude: last.coordinate.longitude))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        finishLocation((error as? CLError)?.code == .denied ? .denied : .unavailable)
    }
}

/// For previews and tests.
struct FakeLocationService: LocationProviding {
    var outcome: LocationOutcome = .found(latitude: 51.5072, longitude: -0.1276)
    func currentLocation(onlyIfAllowed: Bool) async -> LocationOutcome { outcome }
}
