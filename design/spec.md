# 健康社會行為學 課堂即時搶答工具（Kahoot 式）設計規格

- 版本：v1（2026-11-17 09:45）
- 狀態：設計已逐段確認，待使用者審閱本文件
- 適用課程：健康社會行為學（大學部公衛系，目標公衛師國考）

---

## 1. 目標與範圍

**目標**：老師依影片集數（V00–V40）選擇一套課堂搶答題，投影開場；學生掃 QR code、以學號登入，集體限時作答；每題公布答案與詳解，最後產生排行榜；成績寫入 Google Sheet 供課後分析。

**已確認的決策**

| # | 項目 | 決定 |
|---|------|------|
| 1 | 平台 | 用 Claude 撰寫的自製工具，不使用 Kahoot 等商品，不付任何平台費用 |
| 2 | 規模 | 單場同時上線 40 人以內 |
| 3 | 架構 | 網頁放 GitHub Pages；即時同步用 Firebase Realtime Database（Spark 免費方案）；成績寫入 Google Sheet |
| 4 | 題庫 | 另出一套「課堂搶答題庫」，每集 8–10 題，不與前後測題庫重複 |
| 5 | 題目顯示 | 大螢幕與學生手機都顯示完整題目與選項 |
| 6 | 計分 | 答對才計分，越快分數越高（1000 → 500） |
| 7 | 身分 | 事先上傳修課名單；學生輸入學號、確認姓名後進場；一個學號綁一支手機 |
| 8 | 每題之後 | 公布答案、各選項人數長條圖、一句詳解，再顯示目前前 5 名 |
| 9 | 雲端設定 | Claude 透過使用者電腦上的 Chrome 擴充功能代為操作，需要授權時才請使用者確認 |
| 10 | 第一版範圍 | 工具完整做好；題庫先做 V00–V05 試行，課堂試用後再補 V06–V40 |

**不在第一版範圍內**：V06–V40 題庫、分組（團隊）模式、連對加分、非選擇題題型、學生端個人成績歷史頁、背景音樂與音效（可列為之後的改善）。

---

## 2. 已查證的平台限制（決定架構的依據）

| 限制 | 內容 | 影響 |
|------|------|------|
| Firebase Realtime Database Spark 方案 | 同時連線上限 100，無法調高；超過時新連線會被拒絕 | 40 人 + 老師端遠低於上限 |
| Cloud Functions | 需 Blaze 方案（須綁信用卡） | 不寫伺服器端程式；計分由老師端執行，防作弊交給安全規則 |
| Google Apps Script | 每位使用者同時執行上限 30 個 | 不能當即時後端；只用於名單讀取、每場結束一次性寫入成績 |
| Claude Artifact（room／db） | 只辨識擁有者組織成員與受邀訪客；即時訊息不保存、可能遺失 | 學生無 Claude 帳號，不採用 |
| Kahoot 免費版 | 官方頁面：免費 Go 方案上限 40 名參與者 | 使用者選擇自製，不採用 |

來源見文末。

---

## 3. 架構與元件

```
 [老師電腦/投影]                [學生手機 ×40]
  host.html  ──┐             ┌── play.html
  (Google 登入) │             │  (匿名登入)
               ▼             ▼
        Firebase Realtime Database（Spark）
               │
               │ 場次結束時一次寫入（老師端發出）
               ▼
   Google Apps Script 網頁應用程式 ──► Google Sheet
   （名單分頁、成績明細分頁、成績排名分頁）
```

| 元件 | 職責 | 依賴 |
|------|------|------|
| `host.html`（老師端） | Google 登入；選集數、建立場次（6 位數場次碼＋QR code）；控制每題流程；計分；顯示排行榜；結束時寫入 Sheet、提供 CSV 下載；解除學生手機綁定；從 Sheet 同步名單、上傳題庫 | Firebase、Apps Script |
| `play.html`（學生端） | 掃 QR 自動帶入場次碼；輸入學號→確認姓名；顯示題目、選項按鈕、倒數；回饋對錯、得分、名次 | Firebase |
| `scoring.js` | 純函式：計分、排名（可單獨測試） | 無 |
| `database.rules.json` | 安全規則：防作弊、保護答案與名單 | Firebase |
| Apps Script（`Code.gs`） | `getRoster`：回傳名單；`writeResults`：寫入兩張成績表；以老師專用金鑰驗證 | Google Sheet |
| 題庫檔 | 每集一個 JSON，存於本專案；由老師端上傳至 Firebase 老師專屬路徑 | 無 |

**三個安全設計**
1. 題庫**不放在 GitHub**（GitHub Pages 是公開網站）。題庫只存在 Firebase 中僅老師可讀的路徑；學生端每次只收到當題題目與選項，答案在老師按「公布」後才寫出。
2. 名單**不能被整份下載**：學生只能以學號讀取單筆姓名，無法列出整份名單。
3. Apps Script 的驗證金鑰不寫在網頁程式碼中（網頁公開），而是存在 Firebase 僅老師可讀的路徑，老師登入後才讀取。

---

## 4. 資料結構（Realtime Database）

```
/admins/{uid}: true                         老師帳號（手動設定）
/config/sheetToken: "<金鑰>"                 僅老師可讀
/banks/{ep}: { title, questions:[...] }       僅老師可讀寫
/roster/{studentId}: { name }                 已登入者可讀單筆；不可列出整份；僅老師可寫
/rooms/{pin}/
   meta:     { ep, hostUid, createdAt, status, qIndex, qCount }
             status ∈ lobby | question | reveal | leaderboard | final
   current:  { qIndex, text, options[4], timeLimit, startAt }   不含答案
   reveal/{qIndex}: { answer, explanation, counts[4] }         公布時才寫入
   claims/{studentId}: uid                    一個學號綁一支手機
   players/{uid}: { studentId, name, joinedAt }
   answers/{qIndex}/{uid}: { choice, at }     at = 伺服器時間
   scores/{uid}: { total, correct, totalTime }  僅老師可寫
```

**安全規則要點**
- `answers/{qIndex}/{uid}`：僅本人可寫；僅在 `!data.exists()`（只能答一次）、`meta.status == 'question'`、`current.qIndex == qIndex`，且 `now <= current.startAt + timeLimit×1000 + 1000`（1 秒網路緩衝）時可寫；`at` 必須等於伺服器時間 `now`；`choice` 必須是 0–3。
- `claims/{studentId}`：僅在尚未被綁定時可寫，值必須是自己的 uid；老師可刪除（解除綁定）。
- `players/{uid}`：僅本人可寫；`studentId` 必須存在於 `/roster`，且 `claims/{studentId}` 等於自己的 uid。
- `meta`、`current`、`reveal`、`scores`：僅該場次的老師（`hostUid`）可寫；已登入者可讀。
- `/banks`、`/config`：僅 `/admins` 中的帳號可讀寫。
- `/roster`：父節點不可讀（無法列出），子節點 `/roster/{studentId}` 已登入者可讀。

---

## 5. 一場測驗的流程

1. **等候室**：大螢幕顯示 QR code、場次碼、已進場人數與名字。
2. **作答**：老師按「開始」→ 寫入 `current`（含伺服器時間 `startAt`）、`status = question`。題目與倒數同步出現在大螢幕和手機上。預設限時 20 秒，題幹較長者 30 秒，老師可逐題調整。目前在場（已連線）的學生全部作答後即提前結束倒數。
3. **公布答案**：`status = reveal`，老師端寫入 `reveal/{qIndex}`；顯示正確答案、各選項人數長條圖、一句詳解；學生手機顯示對錯與本題得分。
4. **前 5 名**：老師端計分並寫入 `scores`，`status = leaderboard`；學生手機顯示自己目前的名次。
5. 重複 2–4 直到最後一題。
6. **最終排行榜**：`status = final`；前 3 名頒獎台加完整名次；老師端呼叫 Apps Script 寫入 Sheet，並提供 CSV 下載。

**計分公式**（`scoring.js`）
- 答錯、未作答：0 分。
- 答對：`得分 = round(1000 × (1 − t ÷ T ÷ 2))`，t = `at − startAt`（秒，最小 0、最大 T），T = 限時。
- 排名：總分高者在前；同分時總作答時間（各題 t 的總和，只計答對題）短者在前；再同分時依學號。

---

## 6. 錯誤與例外處理

| 情境 | 處理 |
|------|------|
| 學生重新整理或斷網 | 匿名登入身分保存在瀏覽器，重新連線後回到同一身分、接續目前題目；斷線期間未答的題目算 0 分 |
| 學生換手機 | 新手機會被「此學號已在其他裝置登入」擋下；老師端按「解除綁定」後可重新登入 |
| 遲到 | 可中途進場，錯過的題目算 0 分 |
| 學號不在名單 | 顯示「查無此學號，請確認或洽老師」 |
| 老師端關閉或當機 | 進度都在資料庫；重開老師端並選擇未結束的場次即可接續 |
| 逾時送出 | 安全規則拒絕，學生手機顯示「時間到，未計分」 |
| 寫入 Sheet 失敗 | 老師端提示錯誤；可下載 CSV，或按「重新寫入」（資料仍在 Firebase） |
| 場次碼重複 | 建立場次時先檢查，重複就重新產生 |
| 連線數接近上限 | 老師端在 80 人時顯示警告（本課程預期不會發生） |

---

## 7. Google Sheet 結構

- **名單**分頁：`學號 | 姓名`（由老師維護；老師端按「同步名單」寫入 Firebase）。
- **作答明細**分頁（每人每題一列）：`日期時間 | 場次碼 | 集數 | 學號 | 姓名 | 題號 | 概念 | 選項 | 正確答案 | 對錯 | 作答秒數 | 得分`。
- **成績排名**分頁（每人每場一列）：`日期時間 | 場次碼 | 集數 | 學號 | 姓名 | 答對題數 | 總分 | 名次`。

明細表保留每題的對錯與秒數，不受排行榜計分方式影響，可用於課後弱點分析，並可依學號對到前後測資料。

---

## 8. 題庫

**格式**（每集一個檔，例：`V03_課堂搶答題庫_20261117-1000.json`）
```json
{
  "ep": "V03",
  "title": "壓力評估、因應與情緒理論",
  "questions": [
    {
      "id": "V03-L01",
      "q": "題幹",
      "options": ["選項A", "選項B", "選項C", "選項D"],
      "answer": 2,
      "explanation": "一句詳解（40 字以內）",
      "timeLimit": 20,
      "concept": "對應概念",
      "source": "講義 p.xx／改寫自 111 年國考"
    }
  ]
}
```
同時輸出一份 Word 對照表供審閱。檔名都帶集數編號與生成時間，存進本專案。

**出題規則**
- 每集 8–10 題，四選一。
- 題幹盡量 60 字以內、選項盡量 20 字以內（手機上不必捲動）；題幹超過 60 字的題目限時 30 秒。
- 不與前後測題庫重複題幹。
- 每題都對照講義與歷屆國考題對照表查證；講義與網路資料有出入時，上網搜尋足夠證據再判斷，不憑記憶出題。
- 每集至少 3 題改寫自歷屆國考題，標明年份。
- 正確答案平均分散在 A/B/C/D。
- 第一次出現的專有名詞縮寫要附全名。
- 使用者確認題庫後，才上傳到 Firebase。

---

## 9. 測試

1. **計分單元測試**：以固定作答秒數驗算分數與邊界（t = 0、t = T、逾時），以及同分排序。
2. **安全規則測試**（Firebase 本機模擬器，免費）：學生無法改答案、無法讀答案與題庫、無法逾時作答、無法寫他人資料或分數、無法列出名單、無法綁定已被綁定的學號。
3. **40 人負載模擬**：以程式建立 40 個匿名假學生，同時連線、同時作答，確認無漏記、分數與排行榜正確。
4. **Sheet 寫入測試**：驗證三個分頁的欄位與筆數。
5. **實機預演**：老師電腦投影＋數支手機實際跑一場 V00，檢查投影幕上的 QR code 能否掃描、字級是否夠大。

---

## 10. 部署與設定（Claude 透過 Chrome 擴充功能代為操作）

1. 建立 Firebase 專案（Spark 免費方案，不綁信用卡）；啟用 Realtime Database、匿名登入、Google 登入；部署安全規則；把老師帳號加入 `/admins`。
2. 建立 GitHub repo，開啟 GitHub Pages，部署 `host.html`、`play.html`（不含題庫）。
3. 建立 Google Sheet（名單、作答明細、成績排名三個分頁）；部署 Apps Script 網頁應用程式；把金鑰存入 Firebase `/config`。
4. 匯入 V00–V05 題庫；實機預演。

**帳號**：使用者已有 GitHub 帳號，直接在該帳號下建立 repo。

---

## 11. 來源（決定架構的平台限制）

- Firebase Realtime Database Limits（Spark 方案同時連線 100）：https://firebase.google.com/docs/database/usage/limits
- Firebase Realtime Database FAQ（Spark 上限 100 且不能調高）：https://firebase.google.com/docs/database/faq-and-troubleshooting
- Firebase Pricing Plans（Spark 方案 Firestore 免費額度）：https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firebase Google Group：Cloud Functions 需 Blaze 方案：https://groups.google.com/g/firebase-talk/c/4tmyfgttEsI
- Google Apps Script Quotas（每位使用者同時執行 30）：https://developers.google.com/apps-script/guides/services/quotas
- Kahoot!+ 方案說明（免費 Go 方案上限 40 名參與者）：https://kahoot.com/es/home/kahoot-plus/
