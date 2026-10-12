import UIKit

/// The iPhone's share sheet, for the shopping list and an order's picture.
protocol Sharing {
    /// True when something was shared (or saved), false when the person closed the sheet.
    func share(_ content: ShareContent) async -> Bool
}

final class ActivityShareService: Sharing {
    func share(_ content: ShareContent) async -> Bool {
        guard let presenter = UIApplication.shared.topViewController else { return false }
        var items: [Any] = []
        if let bytes = content.image, let image = UIImage(data: bytes) { items.append(image) }
        items.append(content.text)
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let title = content.title { sheet.title = title }
        // iPad-style popover anchor (the app is iPhone only, but this keeps it safe)
        sheet.popoverPresentationController?.sourceView = presenter.view
        return await withCheckedContinuation { continuation in
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                continuation.resume(returning: completed)
            }
            presenter.present(sheet, animated: true)
        }
    }
}

/// For previews and tests.
struct FakeShareService: Sharing {
    var completes = true
    func share(_ content: ShareContent) async -> Bool { completes }
}
