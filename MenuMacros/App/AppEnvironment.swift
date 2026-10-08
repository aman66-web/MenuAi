import Observation

/// The app's dependencies, passed down through the SwiftUI environment (docs/SPEC.md §5).
/// Services (menu data, location, health, store, outbox...) join it in later milestones, each behind a protocol with a fake for previews and tests.
@Observable
final class AppEnvironment {
    init() {}
}
