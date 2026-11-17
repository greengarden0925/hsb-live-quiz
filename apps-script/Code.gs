// 健康社會行為學 課堂搶答：名單讀取與成績寫入
const SHEETS = {
  roster: { name: '名單', head: ['學號', '姓名'] },
  detail: { name: '作答明細', head: ['日期時間', '場次碼', '集數', '學號', '姓名', '題號', '概念', '選項', '正確答案', '對錯', '作答秒數', '得分'] },
  rank: { name: '成績排名', head: ['日期時間', '場次碼', '集數', '學號', '姓名', '答對題數', '總分', '名次'] },
};

// 第一次手動執行：建立三個分頁與金鑰，金鑰顯示在執行紀錄
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(SHEETS).forEach((s) => {
    const sh = ss.getSheetByName(s.name) || ss.insertSheet(s.name);
    sh.getRange(1, 1, 1, s.head.length).setValues([s.head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid());
  Logger.log('TOKEN = ' + props.getProperty('TOKEN'));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function token_() { return PropertiesService.getScriptProperties().getProperty('TOKEN'); }

function doGet(e) {
  if (!e.parameter.token || e.parameter.token !== token_()) return json_({ ok: false, error: 'unauthorized' });
  if (e.parameter.action !== 'roster') return json_({ ok: false, error: 'unknown action' });
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.roster.name);
  const values = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues() : [];
  const roster = values
    .map((r) => ({ studentId: String(r[0]).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), name: String(r[1]).trim() }))
    .filter((r) => r.studentId && r.name);
  return json_({ ok: true, roster });
}

// 同一場次重送時先刪舊列（冪等）
function replaceRows_(sheetName, pin, rows) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const last = sh.getLastRow();
  if (last > 1) {
    const pins = sh.getRange(2, 2, last - 1, 1).getDisplayValues();
    for (let i = pins.length - 1; i >= 0; i--) if (pins[i][0] === pin) sh.deleteRow(i + 2);
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body.token || body.token !== token_()) return json_({ ok: false, error: 'unauthorized' });
    const pin = String(body.pin);
    const detail = replaceRows_(SHEETS.detail.name, pin, body.detail || []);
    const rank = replaceRows_(SHEETS.rank.name, pin, body.rank || []);
    return json_({ ok: true, detail, rank });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
