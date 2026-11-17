// 學號 → 資料庫鍵（加 s 前綴）；只允許英數字
export function normalizeStudentId(input) {
  return String(input || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export const studentKey = (studentId) => 's' + normalizeStudentId(studentId);
export const displayId = (key) => String(key).replace(/^s/, '');
export const qKey = (index) => 'q' + index;
