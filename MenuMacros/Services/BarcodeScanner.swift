import AVFoundation
import PhotosUI
import UIKit
import UniformTypeIdentifiers
import Vision
import VisionKit

/// What scanning a barcode ended with.
nonisolated enum ScanOutcome: Equatable, Sendable {
    case code(String)
    case cancelled
    /// The person refused the camera (Settings › Numbite).
    case denied
    /// This iPhone can't scan (no camera, or no Neural Engine for the live scanner).
    case unavailable
}

/// Reads a product barcode with the camera. The picture never leaves the phone.
protocol BarcodeScanning {
    func scan() async -> ScanOutcome
}

/// The iPhone's own live scanner (VisionKit), shown full screen with "Point at the barcode", a Cancel button and, bottom right, "Photo": a photo of the barcode
/// from the library, read on the phone (founder 2026-11-21: "Barcode from a photo should be inside ... someone can press the bottom right photo"). One at a time.
final class VisionKitBarcodeScanner: BarcodeScanning {
    private var session: ScanSession?

    func scan() async -> ScanOutcome {
        // one scanner at a time: a second request while one is open would stack a second scanner whose Cancel does nothing
        guard session == nil, DataScannerViewController.isSupported else { return .unavailable }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else { return .denied }
        default:
            return .denied
        }
        // checked again after the camera question (no suspension from here to `self.session = session`, so two requests can't both get through)
        guard session == nil, DataScannerViewController.isAvailable, let presenter = UIApplication.shared.topViewController else { return .unavailable }
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

/// One scan: the scanner screen, its Cancel and Photo buttons and the first readable barcode.
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
        // the app is English only (web/lib/mm/config.ts LANGUAGES_ENABLED); a plain instruction instead of a bare camera
        scanner.navigationItem.title = "Point at the barcode"
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { [weak self] _ in
            self?.end(.cancelled)
        })
        let photo = Self.photoButton(UIAction { [weak self] _ in self?.choosePhoto() })
        scanner.view.addSubview(photo)
        photo.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            photo.trailingAnchor.constraint(equalTo: scanner.view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            photo.bottomAnchor.constraint(equalTo: scanner.view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
        ])
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

    private var scanner: DataScannerViewController? {
        navigation?.viewControllers.first as? DataScannerViewController
    }

    /// "Photo", bottom right: a white rounded button with the photo symbol over its word, in the app's ink colour, at the person's text size.
    private static func photoButton(_ action: UIAction) -> UIButton {
        var config = UIButton.Configuration.filled()
        config.image = UIImage(systemName: "photo.on.rectangle", withConfiguration: UIImage.SymbolConfiguration(textStyle: .title2))
        config.title = "Photo"
        config.imagePlacement = .top
        config.imagePadding = 4
        config.cornerStyle = .large
        config.baseBackgroundColor = .white
        config.baseForegroundColor = UIColor(red: 11 / 255, green: 26 / 255, blue: 18 / 255, alpha: 1)
        config.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var out = attributes
            out.font = UIFont.preferredFont(forTextStyle: .subheadline).withTraits(.traitBold)
            return out
        }
        let button = UIButton(configuration: config, primaryAction: action)
        button.accessibilityLabel = "Choose a photo"
        button.accessibilityHint = "Reads the barcode in a photo from your library."
        return button
    }

    /// The photo library (the picker runs apart from the app: no permission is asked and only the chosen photo comes back).
    private func choosePhoto() {
        guard !finished, let navigation else { return }
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        scanner?.stopScanning()
        navigation.present(picker, animated: true)
    }

    private func resumeScanning() {
        guard !finished else { return }
        do {
            try scanner?.startScanning()
        } catch {
            end(.unavailable)
        }
    }

    /// A photo with no barcode in it: a calm line, then back to the live scanner (the person can try another photo, scan, or Cancel).
    private func noCodeInPhoto() {
        let alert = UIAlertController(title: "No barcode found", message: "Try a closer, sharper photo of the barcode, or scan it.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in self?.resumeScanning() })
        navigation?.present(alert, animated: true)
    }

    /// The picked photo's file, as it is in the library.
    private static func imageData(from provider: NSItemProvider) async -> Data? {
        await withCheckedContinuation { continuation in
            _ = provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                continuation.resume(returning: data)
            }
        }
    }

    /// The first product barcode in a photo (Vision, on the phone), or nil.
    nonisolated static func barcode(inImageData data: Data) -> String? {
        let request = VNDetectBarcodesRequest()
        request.symbologies = [.ean13, .ean8, .upce]
        let handler = VNImageRequestHandler(data: data, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        return request.results?.compactMap(\.payloadStringValue).first(where: isProductCode)
    }

    private func end(_ outcome: ScanOutcome) {
        guard !finished else { return }
        finished = true
        scanner?.stopScanning()
        navigation?.dismiss(animated: true)
        finish(outcome)
    }

    /// EAN-13, EAN-8, UPC-A/E: 8 to 14 digits (the page checks it again).
    nonisolated static func isProductCode(_ value: String) -> Bool {
        (8...14).contains(value.count) && value.allSatisfy(\.isASCII) && value.allSatisfy(\.isNumber)
    }
}

extension ScanSession: PHPickerViewControllerDelegate {
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider, provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
            resumeScanning()
            return
        }
        Task { [weak self] in
            let data = await Self.imageData(from: provider)
            let code = await Task.detached { data.flatMap(ScanSession.barcode(inImageData:)) }.value
            guard let self, !self.finished else { return }
            if let code {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                self.end(.code(code))
            } else {
                self.noCodeInPhoto()
            }
        }
    }
}

private extension UIFont {
    func withTraits(_ traits: UIFontDescriptor.SymbolicTraits) -> UIFont {
        guard let descriptor = fontDescriptor.withSymbolicTraits(traits) else { return self }
        return UIFont(descriptor: descriptor, size: 0)
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
