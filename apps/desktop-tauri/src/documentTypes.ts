export const officeFileTypes = ["docx", "xlsx", "pptx", "doc", "xls", "ppt", "wps", "et", "dps"] as const;
export const textFileTypes = ["txt", "log", "csv", "md"] as const;
export const imageFileTypes = ["png", "jpg", "jpeg", "webp"] as const;

export type LocalDocumentRoute = "pdf" | "office" | "text" | "image" | "ofd";
export type RecentDocumentRoute = "pdf" | "office" | "text" | "image" | "ofd";

function normalizedFileType(fileType: string) {
  return fileType.trim().toLowerCase();
}

function pathHasExtension(path: string, extensions: readonly string[]) {
  const extensionPattern = extensions.join("|");
  return new RegExp(`\\.(${extensionPattern})$`, "i").test(path);
}

function fileTypeFromPath(path: string, extensions: readonly string[]) {
  const extensionPattern = extensions.join("|");
  return new RegExp(`\\.(${extensionPattern})$`, "i").exec(path)?.[1].toLowerCase() ?? null;
}

export function isOfficeFileType(fileType: string) {
  return officeFileTypes.includes(normalizedFileType(fileType) as (typeof officeFileTypes)[number]);
}

export function isTextFileType(fileType: string) {
  return textFileTypes.includes(normalizedFileType(fileType) as (typeof textFileTypes)[number]);
}

export function isImageFileType(fileType: string) {
  return imageFileTypes.includes(normalizedFileType(fileType) as (typeof imageFileTypes)[number]);
}

export function isOfficePath(path: string) {
  return pathHasExtension(path, officeFileTypes);
}

export function officeFileTypeFromPath(path: string) {
  return fileTypeFromPath(path, officeFileTypes);
}

export function isTextPath(path: string) {
  return pathHasExtension(path, textFileTypes);
}

export function textFileTypeFromPath(path: string) {
  return fileTypeFromPath(path, textFileTypes);
}

export function isImagePath(path: string) {
  return pathHasExtension(path, imageFileTypes);
}

export function imageFileTypeFromPath(path: string) {
  return fileTypeFromPath(path, imageFileTypes);
}

export function isPdfPath(path: string) {
  return pathHasExtension(path, ["pdf"]);
}

export function isOfdPath(path: string) {
  return pathHasExtension(path, ["ofd"]);
}

export function localDocumentRoute(path: string): LocalDocumentRoute {
  if (isPdfPath(path)) {
    return "pdf";
  }
  if (isOfficePath(path)) {
    return "office";
  }
  if (isTextPath(path)) {
    return "text";
  }
  if (isImagePath(path)) {
    return "image";
  }
  return "ofd";
}

export function recentDocumentRoute(fileType: string): RecentDocumentRoute {
  if (normalizedFileType(fileType) === "pdf") {
    return "pdf";
  }
  if (isOfficeFileType(fileType)) {
    return "office";
  }
  if (isTextFileType(fileType)) {
    return "text";
  }
  if (isImageFileType(fileType)) {
    return "image";
  }
  return "ofd";
}
