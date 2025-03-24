/**
 * 日付を指定された形式でフォーマットする関数
 * @param date 日付
 * @param format フォーマット（デフォルトは 'YYYY-MM'）
 * @returns フォーマットされた日付文字列
 */
export function formatDate(date: Date, format: string = "YYYY-MM"): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return format
    .replace("YYYY", String(year))
    .replace("MM", month)
    .replace("DD", day)
    .replace("HH", hours)
    .replace("mm", minutes)
    .replace("ss", seconds);
}
