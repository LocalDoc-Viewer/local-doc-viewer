export function displayNameFromPath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1]?.trim() || "本地文档";
}

export function localDocumentDirectoryFromPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }

  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (lastSlash < 0) {
    return null;
  }

  const parentEnd = lastSlash === 0 || /^[A-Za-z]:[\\/]/.test(trimmed) && lastSlash === 2
    ? lastSlash + 1
    : lastSlash;
  return trimmed.slice(0, parentEnd);
}
