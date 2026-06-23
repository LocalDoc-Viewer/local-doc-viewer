export type AppearanceThemePreference = "system" | "light" | "dark-comfort";

export type ResolvedAppearanceTheme = "light" | "dark-comfort";

export const defaultAppearanceThemePreference: AppearanceThemePreference = "system";

export function appearanceThemePreferenceFromStorage(value: string | null): AppearanceThemePreference {
  if (value === "system" || value === "light" || value === "dark-comfort") {
    return value;
  }
  return defaultAppearanceThemePreference;
}

export function resolvedAppearanceTheme(
  preference: AppearanceThemePreference,
  isSystemDark: boolean,
): ResolvedAppearanceTheme {
  if (preference === "system") {
    return isSystemDark ? "dark-comfort" : "light";
  }
  return preference;
}

export function appearanceThemeDataset(
  preference: AppearanceThemePreference,
  isSystemDark: boolean,
) {
  return {
    preference,
    resolved: resolvedAppearanceTheme(preference, isSystemDark),
  };
}
