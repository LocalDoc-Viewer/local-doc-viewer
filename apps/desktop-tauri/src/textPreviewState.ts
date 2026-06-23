export function lineNumbersForText(text: string) {
  const lineCount = text.length === 0 ? 1 : text.split(/\r\n|\r|\n/).length;
  return Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
}

export function lineIndexFromTextOffset(text: string, offset: number) {
  const beforeMatch = text.slice(0, Math.max(0, offset));
  return beforeMatch.split(/\r\n|\r|\n/).length - 1;
}
