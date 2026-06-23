type PageJumpResult =
  | { ok: true; pageIndex: number }
  | { ok: false; message: string };

export function parsePageJumpInput(value: string, pageCount: number): PageJumpResult {
  const normalized = value.trim();
  const maxPage = Math.max(1, pageCount);

  if (!normalized) {
    return { ok: false, message: "请输入页码。" };
  }

  if (!/^-?\d+$/.test(normalized)) {
    return { ok: false, message: "页码必须是整数。" };
  }

  const pageNumber = Number.parseInt(normalized, 10);
  if (pageNumber < 1 || pageNumber > maxPage) {
    return { ok: false, message: `页码必须在 1 到 ${maxPage} 之间。` };
  }

  return { ok: true, pageIndex: pageNumber - 1 };
}
