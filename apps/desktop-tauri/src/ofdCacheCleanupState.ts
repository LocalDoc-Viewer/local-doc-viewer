export type PreviousDocumentCacheSessionState = {
  id: string;
  file_type: string;
};

export function previousDocumentCacheCleanupTarget(
  previousSession: PreviousDocumentCacheSessionState | null,
  nextSession: PreviousDocumentCacheSessionState | null,
) {
  if (!previousSession || previousSession.file_type === "fake" || previousSession.file_type === "pdf") {
    return null;
  }
  if (nextSession && previousSession.id === nextSession.id) {
    return null;
  }

  return previousSession.id;
}
