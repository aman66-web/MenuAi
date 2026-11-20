import { SettingsScreen } from "../settings/SettingsScreen";

// Daily targets on a page of its own (founder 2026-11-20: Meal plan's "Change my numbers" opens "the daily targets page", not Settings).
export default function TargetsPage() {
  return <SettingsScreen only="targets" />;
}
