# 學生作品畫廊

一個 3D 網上畫廊。老師上傳學生作品，學生用老師俾嘅專屬連結（或者 QR code）入去行，近距離欣賞作品，仲可以用貓貓貼紙同讚美詞讚同學。

## 功能一覽
- **畫廊同通道**：每個畫廊都要設定年級（一至六年級或者全校）。門口大標題會顯示作品名稱、第幾屆同副題，每個班都有一條通道，亦可以全級共用一條通道
- **三種作品**
  - 平面作品：掛喺兩邊牆
  - 立體作品（多角度相片）：擺喺展台上面輪流轉，撳落去可以左右拖動，轉睇唔同角度
  - 立體作品（3D 掃描檔 .glb）：擺喺展台上面自轉，撳落去可以用手指轉同放大縮細
- **讚賞**：只可以揀預設嘅貼紙同讚美詞，冇得打字。每位學生每件作品可以讚一次，讚賞會即時貼喺作品隔籬
- **老師帳戶**：用 Google 帳戶登入。第一個登入嘅老師會自動成為管理員，負責批准其他老師。每位老師只會見到自己嘅畫廊、連結同學生名單
- **學生連結**：每條連結都可以剔選學生睇到邊幾級。例如只剔「四年級」，學生就只會見到四年級嘅畫廊。想開放其他級，多剔一級就即時生效，唔使換連結。每條連結都有 QR code，可以放大投影俾全班掃
- **安全**：學生唔可以直接讀取資料庫，一定要經連結先睇到作品，而且只會睇到老師開放嘅年級

## 試用模式
如果 `js/config.js` 未填 Supabase 資料，網站就會用「試用模式」：資料只會存喺嗰部機，入面有示範連結同示範作品。

## 設定雲端（Supabase，免費）
1. 去 https://supabase.com 開一個免費帳戶，然後撳 **New project**，地區揀 Singapore。
2. 打開 **SQL Editor** → **New query**，將 `supabase/setup.sql` 成個檔案貼入去，再撳 **Run**。
3. 打開 **Project Settings** → **API**，複製 **Project URL** 同 **anon public key**，然後貼入 `js/config.js`。
4. 設定 Google 登入：
   1. 去 https://console.cloud.google.com 開一個 project，然後打開 **APIs & Services** → **OAuth consent screen**，User type 揀 External，再填好 App 名稱同電郵。
   2. 打開 **Credentials** → **Create credentials** → **OAuth client ID**，類型揀 **Web application**。
   3. 喺 **Authorized redirect URIs** 加入 `https://你的project.supabase.co/auth/v1/callback`。呢條網址可以喺 Supabase → Authentication → Providers → Google 搵到。
   4. 將 Client ID 同 Client Secret 貼入 Supabase → **Authentication** → **Providers** → **Google**，然後撳 Enable。
   5. 打開 Supabase → **Authentication** → **URL Configuration**，將 **Site URL** 同 **Redirect URLs** 都設做你嘅 GitHub Pages 網址，例如 `https://你的帳戶.github.io/student-gallery/`。
5. 打開網站，喺網址後面加 `#admin`，然後用 Google 登入。第一個登入嘅人會自動成為管理員。

> 注意：免費 project 如果連續 7 日冇人用，會自動暫停。暫停咗嘅話，入 Supabase 撳 **Restore** 就會重新開返。
> 免費版有 1GB 儲存空間。3D 掃描檔每個最好細過 40MB，匯出時揀 2K 材質就會細好多。

## 掃描立體作品
- 推薦 app：**Scaniverse**（免費，iPhone 同 Android 都有）。掃描完之後揀 Export → GLB 匯出
- 掃描技巧：將作品放喺有圖案嘅桌面上，光線要平均，然後圍住作品慢慢行一至兩圈
- 唔想掃描的話，可以喺作品周圍每隔大約 45° 影一張相，一共 6 至 8 張，然後揀「多角度相片」上傳

## 上傳作品小貼士
- 將檔案名改做「學號 姓名」，例如 `12 陳小明.jpg`，系統就會自動填好學號同姓名
- 如果已經輸入咗學生名單，檔案名只寫學號都得
- 3D 檔上傳時，系統會自動影一張封面相

## 修改貼紙或讚美詞
改完 `js/constants.js` 之後，記得同步修改 `supabase/setup.sql` 入面 `reactions` 表嘅清單，然後喺 Supabase 重新 Run 一次。
