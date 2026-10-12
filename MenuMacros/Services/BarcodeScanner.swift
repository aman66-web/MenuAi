import AVFoundation
import UIKit
import VisionKit

/// What scanning a barcode ended with.
nonisolated enum ScanOutcome: Equatable, Sendable {
    case code(String)
    case cancelled
    /// The person refused the camera (Settings › Menu Math).
    case denied
    /// This iPhone can't scan (no camera, or no Neural Engine for the live scanner).
    case unavailable
}

/// Reads a product barcode with the camera. The picture never leaves the phone.
protocol BarcodeScanning {
    func scan() async -> ScanOutcome
}

/// The iPhone's own live scanner (VisionKit), shown full screen with a Cancel button.
final class VisionKitBarcodeScanner: BarcodeScanning {
    private var session: ScanSession?

    func scan() async -> ScanOutcome {
        guard DataScannerViewController.isSupported else { return .unavailable }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else { return .denied }
        default:
            return .denied
        }
        guard DataScannerViewController.isAvailable, let presenter = UIApplication.shared.topViewController else { return .unavailable }
        return await withCheckedContinuation { continuation in
            let session = ScanSession { [weak self] outcome in
                self?.session = nil
                continuation.resume(returning: outcome)
            }
            self.session = session
            session.present(from: presenter)
        }
    }
}

/// One scan: the scanner screen, its Cancel button and the first readable barcode.
private final class ScanSession: NSObject, DataScannerViewControllerDelegate {
    private let finish: (ScanOutcome) -> Void
    private var finished = false
    private var navigation: UINavigationController?

    init(finish: @escaping (ScanOutcome) -> Void) {
        self.finish = finish
    }

    func present(from presenter: UIViewController) {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = self
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { [weak self] _ in
            self?.end(.cancelled)
        })
        let navigation = UINavigationController(rootViewController: scanner)
        navigation.modalPresentationStyle = .fullScreen
        self.navigation = navigation
        presenter.present(navigation, animated: true) {
            do {
                try scanner.startScanning()
            } catch {
                self.end(.unavailable)
            }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            if case .barcode(let barcode) = item, let digits = barcode.payloadStringValue, Self.isProductCode(digits) {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                end(.code(digits))
                return
            }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        end(.unavailable)
    }

    private func end(_ outcome: ScanOutcome) {
        guard !finished else { return }
        finished = true
        (navigation?.viewControllers.first as? DataScannerViewController)?.stopScanning()
        navigation?.dismiss(animated: true)
        finish(outcome)
    }

    /// EAN-13, EAN-8, UPC-A/E: 8 to 14 digits (the page checks it again).
    static func isProductCode(_ value: String) -> Bool {
        (8...14).contains(value.count) && value.allSatisfy(\.isASCII) && value.allSatisfy(\.isNumber)
    }
}

/// For previews and tests: answers with a fixed outcome.
struct FakeBarcodeScanner: BarcodeScanning {
    var outcome: ScanOutcome = .code("5000157024671")
    func scan() async -> ScanOutcome { outcome }
}

extension UIApplication {
    /// The view controller on top, to present the scanner and the share sheet from.
    var topViewController: UIViewController? {
        let window = connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
