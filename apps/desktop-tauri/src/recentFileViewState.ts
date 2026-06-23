export type RecentFileViewEntryInput = {
  id: string;
  displayName: string;
  fileType: string;
  openedAt: string;
  locationHint?: string | null;
};

export type RecentFileViewState = {
  id: string;
  displayName: string;
  fileType: string;
  openedAt: string;
  locationHint: string;
  iconLabel: string;
  isUnavailable: boolean;
  shouldShowLocationHint: boolean;
  title: string;
};

export function recentFileViewStates(input: {
  entries: RecentFileViewEntryInput[];
  unavailableIds: ReadonlySet<string>;
}): RecentFileViewState[] {
  const displayNameCounts = new Map<string, number>();
  for (const entry of input.entries) {
    displayNameCounts.set(entry.displayName, (displayNameCounts.get(entry.displayName) ?? 0) + 1);
  }

  return input.entries.map((entry) => {
    const isUnavailable = input.unavailableIds.has(entry.id);
    const locationHint = entry.locationHint?.trim() ?? "";
    const shouldShowLocationHint = locationHint !== "" && (displayNameCounts.get(entry.displayName) ?? 0) > 1;
    return {
      id: entry.id,
      displayName: entry.displayName,
      fileType: entry.fileType,
      openedAt: entry.openedAt,
      locationHint,
      iconLabel: recentFileIconLabel(entry.fileType),
      isUnavailable,
      shouldShowLocationHint,
      title: recentFileTitle({
        displayName: entry.displayName,
        locationHint,
        shouldShowLocationHint,
        isUnavailable,
      }),
    };
  });
}

function recentFileIconLabel(fileType: string): string {
  const normalized = fileType.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (normalized || "DOC").slice(0, 4);
}

function recentFileTitle(input: {
  displayName: string;
  locationHint: string;
  shouldShowLocationHint: boolean;
  isUnavailable: boolean;
}): string {
  const visibleLocationHint = input.shouldShowLocationHint ? input.locationHint : "";
  if (input.isUnavailable) {
    return `${input.displayName} - 文件不可用${visibleLocationHint ? ` (${visibleLocationHint})` : ""}`;
  }
  return visibleLocationHint ? `${input.displayName} · ${visibleLocationHint}` : input.displayName;
}
