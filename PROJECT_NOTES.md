# 新莊區道務檢視 專案紀錄

## 一、系統架構
- Google Apps Script
- Google Sheet
- GitHub Pages

## 二、前端檔案
- index.html：登入
- register.html：申請帳號
- forgot.html：忘記/變更密碼
- home.html：首頁
- annual.html：今年道務
- history.html：近年道務

## 三、Apps Script 檔案
- Config.gs
- Auth.gs
- Session.gs
- Captcha.gs
- Cache.gs
- AnnualStats.gs
- RecentStats.gs
- SummaryBuilder.gs
- TaoReportFetcher.gs
- AnnualAutoSync.gs

## 四、Google Sheet 工作表
- 帳號名單
- 壇名
- 2026求道
- 2026法會
- 近年道務彙總
- 即時報表_求道
- 即時報表_法會
- 即時道務統計

## 五、年度表欄位
A：壇名
B：五常德
C：年度目標
D：總計
E～P：1～12月

## 六、同步規則
- 數字才寫入
- 0 不寫入
- "-" 不寫入
- 壇名來源為「壇名」工作表 A2:A71
- 包含 99_其他
- 不新增「壇名」標題列

## 七、目前已完成
- 登入
- 驗證碼
- 申請帳號
- 忘記密碼
- 今年道務
- 近年道務
- 近年道務彙總
- TaoReport01 自動抓取
- 自動登入道務系統
- 自動切換身份 2374
- 手機一鍵更新
- 首頁顯示最後更新時間
- 即時報表同步到年度表
- 年度表自動建立
- 五常德同步至 B 欄
- Cache.gs 快取最後更新時間
- 登入頁新版美化
- 驗證碼改為 6 碼純數字

## 八、目前注意事項
- 修改前端後，GitHub Pages 可能會有快取，要改版本號，例如 ?v=20260619-5
- 修改 Apps Script 後，要重新部署 Web App
- 登入頁 id 必須符合 login.js：
  - loginForm
  - loginMessage
  - loginAccount
  - loginPassword
  - captchaInput
  - captchaImage
  - refreshCaptchaBtn
