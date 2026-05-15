# ASOBI Lab.

生徒・授業の管理 Web アプリ。Next.js (App Router) + Supabase + Tailwind CSS。

- 複数の講師がログインして使える（Supabase Auth）
- スマホ・PC 両対応のレスポンシブ UI
- 生徒の基本情報（名前・学年・メモ）の登録
- 授業ごとに **出欠** と **本日のテキスト内容** を記録
- 生徒ごとの過去の授業履歴を時系列で閲覧

---

## 1. セットアップ

### 1-1. 依存関係のインストール

```bash
npm install
```

### 1-2. Supabase プロジェクトを作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成
2. **Project Settings → API** から下記をコピー
   - Project URL
   - anon public key
3. **Authentication → Providers → Email** を有効化
   - 開発中は「Confirm email」を OFF にすると楽です

### 1-3. データベースのスキーマを適用

Supabase の **SQL Editor** で `supabase/schema.sql` を貼り付けて Run。

### 1-4. 環境変数を設定

`.env.local.example` をコピーして `.env.local` を作成し、Supabase の値を入れます。

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 1-5. 開発サーバを起動

```bash
npm run dev
```

http://localhost:3000 を開きます。

### 1-6. 講師アカウントを作る

- ログイン画面の **「新規登録（招待制）」** からメール+パスワードで登録
- Supabase 側で「Confirm email」がオンの場合、確認メールのリンクをクリック
- メール認証なしで素早く試したい場合は **Authentication → Users → Add user** から手動作成

### 1-7. CSV インポート想定のサンプル

一括取り込みを実装する前でも、SQL や自作スクリプト用の **列の例**として使えます（UTF-8 BOM 付き・Excel で文字化けしにくい形です）。

| ファイル | 内容 |
| --- | --- |
| `samples/students_import_sample.csv` | 生徒（`student_id` 空＝新規、入っていれば更新例） |
| `samples/lessons_import_sample.csv` | 授業（`student_id` は実際の UUID に差し替え必須） |

`00000000-0000-0000-0000-...` はダミー ID です。

---

## 2. ディレクトリ構成

```
src/
├── middleware.ts                   # 未ログインを /login に飛ばす
├── app/
│   ├── layout.tsx                  # ルートレイアウト
│   ├── globals.css                 # Tailwind + 日本語フォント
│   ├── login/                      # ログイン (Server Action)
│   ├── auth/signout/route.ts       # サインアウト POST エンドポイント
│   └── (dashboard)/                # ログイン必須エリア
│       ├── layout.tsx              # ヘッダー付きレイアウト
│       ├── page.tsx                # ホーム (本日 / 直近の授業)
│       └── students/
│           ├── page.tsx            # 生徒一覧 + 検索
│           ├── actions.ts          # 生徒の作成 / 削除
│           ├── new/page.tsx        # 生徒の新規登録
│           └── [id]/
│               ├── page.tsx        # 生徒詳細 + 授業履歴
│               └── lessons/new/    # 授業の新規記録
├── components/                     # 共通 UI
│   ├── ClassroomBadge.tsx          # 所属教室の色付きバッジ
│   ├── ClassroomSubjectsField.tsx  # 教室セレクト + 動的な教科チェックボックス (Client)
│   ├── ConfirmDeleteForm.tsx       # confirm() ダイアログつきの削除フォーム
│   ├── DailyDateNav.tsx            # 前日/翌日/日付ピッカー (Client)
│   ├── DailyLessonCarousel.tsx     # コマごとの横スクロールカード
│   ├── LessonForm.tsx              # 授業フォーム (Client、コマ/教科書/種別/出欠/科目)
│   ├── CapacityForm.tsx            # 振替枠の作成/編集フォーム (Client)
│   └── ...
├── app/(public)/                   # 認証不要の保護者向けエリア
│   ├── layout.tsx
│   └── apply/
│       ├── page.tsx                # /apply 振替申請ページ
│       ├── MakeupApplyFlow.tsx     # 3ステップフロー全体 (Client)
│       ├── AvailabilityPicker.tsx  # 空き状況グリッド + Realtime + 予約 (Client)
│       └── actions.ts              # lookupStudent / bookMakeupLesson Server Actions
└── app/api/availability/route.ts   # 公開 GET API: 指定日の空き状況を返す
└── lib/
    ├── types.ts                    # GradeLevel / AttendanceStatus など
    └── supabase/                   # ssr クライアント (browser/server/middleware)

supabase/
└── schema.sql                      # テーブル / ENUM / RLS

samples/                            # CSV 想定フォーマットのサンプル（インポート実装・SQL 用）
├── students_import_sample.csv
└── lessons_import_sample.csv
```

---

## 3. データベース設計

| テーブル        | カラム                                                                                                                              | 役割                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `auth.users`    | (Supabase 標準)                                                                                                                     | 講師アカウント                             |
| `students`           | `id`, `name`, `grade`, `classroom`, `subjects[]`, `note`, `created_at`, `created_by`                                                                              | 生徒の基本情報 + 所属教室 + 受講教科                              |
| `lessons`            | … ＋ `source_lesson_date`, `source_period`, `source_subject`（振替の「欠席した元のコマ」） | 授業ごとの出欠 + 進捗メモ + 科目 + 種別 + コマ番号 + 使用テキスト |
| `lesson_capacities`  | `id`, `classroom`, `day_of_week`, `week_ordinals`, `period`, `subject`, `max_students`, `note`, … | (教室・曜日・**開催週**・コマ・教科) 単位の **振替の最大受け入れ人数**（第2・第4週など） |

加えて、保護者向けフォームから呼び出される SECURITY DEFINER の RPC 例:

| 関数 | 役割 |
| --- | --- |
| `find_student_for_makeup(name, classroom, grade)` | 本人確認 |
| `list_scheduled_lessons_for_makeup(student_id, name, classroom, grade [, from_date])` | 欠席にできる「出席予定」の一覧 |
| `get_makeup_availability(target_date)` | 指定日の各枠の空き（曜日＋**月内第◯週**が `week_ordinals` に一致する枠のみ） |
| `book_makeup_lesson(student_id, lesson_date, period, subject, source_lesson_date, source_period, source_subject [, text_memo])` | 欠席元の更新・登録と振替予約（`source_*` 保存）を原子的に実行 |

### RLS の方針（現状）

- **職員（`teacher_profiles.account_role = 'staff'`）**  
  自分が登録した授業の更新など、従来どおりの権限。生徒・授業は原則すべて閲覧・操作可（運用上はスタッフ共有前提）。
- **保護者（`account_role = 'parent'`）**  
  `parent_student_links` で紐付けられた **お子様の生徒・授業だけ** SELECT 可。職員用ダッシュボードには入れず **`/parent`** で予定一覧のみ。
- **振替枠 `lesson_capacities`**  
  職員のみ閲覧。保護者の空き確認は RPC `get_makeup_availability` 経由（`/apply`）。

（README の旧記述「全講師が全生徒更新可」は、現行スキーマと異なる部分があります。**最新は `supabase/schema.sql` のポリシー**を正としてください。）


### 教室マスタ

教室一覧と各教室の開講教科は **`src/lib/types.ts` の `CLASSROOMS` 定数で集中管理** しています。
教室を追加したい時は同ファイルに 1 行追加し、合わせて `supabase/schema.sql` の `students_classroom_check` 制約にも教室名を足してください。

| 教室 | 開講教科 |
| --- | --- |
| 長浜八幡中山教室 | ロボット |
| 長浜駅前通り教室 | ロボット / プログラミング |
| 米原駅前教室 | ロボット / プログラミング |
| 米原長岡教室 | ロボット / プログラミング |
| 西宮鳴尾町教室 | ロボット / プログラミング |
| 出屋敷教室 | ロボット / プログラミング |
| 長浜神照教室 | プログラミング |
| 学校法人芦屋学園芦屋大学附属幼稚園教室 | ロボット |

---

## 4. 主要画面

| パス                                            | 内容                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/login`                                        | ログイン / 新規登録                                                                                        |
| `/`                                             | ホーム：**日毎のコマ表カルーセル**（前日/翌日ナビ＋日付ピッカー）/ 今後の予定 / 最近の記録                 |
| `/?date=YYYY-MM-DD`                             | 任意日のコマ表を表示                                                                                       |
| `/students`                                     | 生徒一覧（名前検索 + **所属教室で絞り込み**、教室別チップで件数把握）                                      |
| `/students/new`                                 | 生徒の新規登録                                                                                             |
| `/students/[id]`                                | 生徒詳細：進捗ハイライト / 出席率 / 月別カレンダー / 授業履歴（メモ検索＋編集削除）                        |
| `/students/[id]/edit`                           | 生徒情報の編集                                                                                             |
| `/students/[id]/lessons/new`                    | 授業の新規記録（日付 / コマ / 出欠 / 科目 / 使用テキスト）                                                 |
| `/students/[id]/lessons/[lessonId]/edit`        | 授業記録の編集（自分が記録 or 管理者のみ）                                                                 |
| `/capacities`                                   | **振替枠の設定**（教室・曜日・コマ・教科ごとの最大受け入れ人数を CRUD、書き込みは管理者のみ）              |
| `/capacities/[id]/edit`                         | 振替枠の編集                                                                                               |
| `/parent` *(要ログイン・保護者のみ)* | **お子様の予定**（今日から約120日先までの `scheduled`、振替元の表示あり） |
| `/api/availability?date=YYYY-MM-DD` *(認証不要)*| 指定日の振替枠の空き状況を返す JSON API（保護者フォームのリアルタイム更新で使用）                          |

---

## 5. 開発チェックリスト

機能追加するたびに、本番投入前に必ず通すべき項目です。**忘れがちなのでここに常駐**。

### 認証まわり (Auth)
- [ ] **新規サインアップ** が成功する（管理者メール / 一般メール）
- [ ] **承認メールが実際に受信ボックスに届く**（スパムではなく Inbox）
  - Supabase デフォルト SMTP は無料枠で 1時間 3〜4通 のレート制限あり。本番では **Resend / SendGrid 等のカスタム SMTP を必ず設定**
  - 開発中に「届かない」場合は SQL で `update auth.users set email_confirmed_at = now() where email = '...'` でバイパス可
- [ ] 承認メール内のリンクをクリック → アプリにリダイレクトされてログイン状態になる
- [ ] パスワードリセットメール（実装したら）も同様に到達確認
- [ ] **管理者メール** でサインアップ → ヘッダーに「管理者」バッジが出る
- [ ] **一般メール** でサインアップ → 「管理者」バッジが出ない
- [ ] ログアウトボタンで `/login` に戻る

### データ操作 (RLS)
- [ ] 一般講師が他人の生徒を更新できる / 削除はできない
- [ ] 一般講師が他人の授業記録を編集・削除できない
- [ ] 管理者は他人の生徒・授業記録を削除できる
- [ ] 一般講師が `is_admin = true` に自己昇格できない（ポリシーで防御済み）

### UI / レスポンシブ
- [ ] スマホ幅（〜375px）でヘッダー・フォーム・一覧が破綻しない
- [ ] 日本語フォントが macOS / Windows / iOS / Android 全部で読みやすい
- [ ] **ホームのコマ表カルーセル**：スマホで横スワイプ・PC でドラッグ/ホイール横スクロールが効く
- [ ] **削除ダイアログ**：生徒・授業・予定の削除ボタンで `confirm()` ダイアログが出て、キャンセルでデータが消えない
- [ ] **教室選択 → 教科候補の連動**：教室を変えると、その教室で開講していない教科チェックボックスが自動で外れる（例: 長浜八幡中山教室 → ロボットのみ）
- [ ] **教室の整合性**：開講していない教科を強引に保存しようとした時、サーバ側でエラーになる（フォームを直接 fetch 等で叩くケース）

### 振替申請フォーム
- [ ] `/apply` に未ログインでアクセスできる（`/login` にリダイレクトされない）
- [ ] 名前・教室・学年が一致しない時、適切なエラーメッセージが出る
- [ ] 同姓同名・同教室・同学年が複数いるケース（テスト用に作ってみる）でエラーが出る
- [ ] 容量 0 の枠は最初から「満員」表示
- [ ] 1 つの枠を 2 つの別ブラウザから同時に申請 → 後勝ちが満員エラーになる（容量レース）
- [ ] 同一生徒が同じ枠を 2 回申請 → 「すでに申請済み」エラー
- [ ] 申請後、別ブラウザの保護者画面で空き数が自動的に減る（Realtime）
- [ ] Realtime が来なくても 30 秒後にはポーリングで更新される

---

## 6. 本番に出す（初心者向け・ステップバイステップ）

「本番」とは、**インターネット上の URL** でスタッフ・保護者がブラウザから使える状態のことです。大きく **2つ** あります。

| 場所 | 役割 |
| --- | --- |
| **Supabase** | データベース・ログイン（メール・パスワード）の管理 |
| **Vercel**（おすすめ） | この Next.js アプリ本体を公開するホスティング |

※ 無料で始められます。既に Supabase / Vercel のアカウントがあれば **ステップ A から**でOKです。

---

### 準備：無料アカウント（まだなら）

1. **GitHub** … [github.com](https://github.com) でアカウント作成（コードを置くため）
2. **Supabase** … [supabase.com](https://supabase.com) でプロジェクト作成（DB・認証）
3. **Vercel** … [vercel.com](https://vercel.com) でアカウント作成（サイト公開。GitHub と連携）

---

### ステップ A：このアプリのコードを GitHub に上げる

1. パソコンでこのフォルダ `juku` を開く
2. GitHub 上で **新しいリポジトリ** を空で作成する（名前は `juku` など好きな名前）
3. ターミナルで（例）:

```bash
cd /Users/takuto/Desktop/juku
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/リポジトリ名.git
git push -u origin main
```

すでに push 済みならこのステップは省略。

---

### ステップ B：Supabase で「箱」を用意する

1. Supabase ダッシュボードで **New project**（リージョンは東京 `ap-northeast-1` でOK）
2. プロジェクトができたら左メニュー **Project Settings → API** を開く  
   ここに **`Project URL`** と **`anon` `public`** キー、`service_role` キーがある（後でコピー）

---

### ステップ C：データベースに「設計図」を流し込む（重要）

1. Supabase 左メニュー **SQL Editor** → **New query**
2. このリポジトリの **`supabase/schema.sql` をエディタで開き、中身をすべてコピー**
3. SQL Editor に貼り付けて **Run**（数十秒かかることがあります）
4. **`column tp.account_role does not exist`**（`is_staff_user` 関連）となる場合は、**このリポジトリ最新の `schema.sql` を使ってください**。`teacher_profiles.account_role` 列を **`is_staff_user()` より前に** 作る順序に修正済みです。古いコピーを流した場合は、`supabase/patches/step_c_account_role_then_is_staff_user.sql` を先に Run してから、**`schema.sql` を全文もう一度 Run** してください。
5. エラーになったら、表示された行番号をメモしてから **全文をもう一度**貼り付けていないか、`rpc` だけ先に流していないかを確認（README の「8. 差分」のトラブル欄も参照）

ここまででテーブル・関数・RLS（誰が何を読めるか）が揃います。

---

### ステップ D：メールでログインできるようにする（本番）

1. Supabase **Authentication → Providers → Email** … **有効**
2. 本番では **Confirm email（メール確認）を ON** にすることが多いです（スパム・なりすまし対策）
3. メールが届かないときは **Authentication →  ** を確認  
   - **Site URL** … 後で決まる本番 URL（先に Vercel でデプロイしたあとで直してもOK）  
   - **Redirect URLs** に `https://あなたの本番ドメイン/**` と `http://localhost:3000/**` を追加

---

### ステップ E：Vercel に環境変数を入れる

ここでいう「環境変数」は、**本番サーバー上でだけ使う Supabase の接続情報**です。コードには書かず、Vercel が秘密を差し込みます。

**タイミングの目安**

- **すでに Vercel にプロジェクトがある**（ステップ F を終えた）→ 下記 **A** の「Settings から」でOKです。
- **これから GitHub と連携して初回デプロイする**（これから F）→ ステップ F の **Configure Project** 画面の下の方にある **Environment Variables** に、下の 3 つをそのまま入れてから Deploy しても同じです。

---

**手順 A：いまできているプロジェクトに後から足す**

1. ブラウザで [vercel.com](https://vercel.com) にログインする  
2. 画面上部の **Dashboard** で、このアプリ用の **プロジェクト名** をクリックする  
3. プロジェクトの上メニューから **Settings**（設定）を開く  
4. 左の一覧から **Environment Variables** を選ぶ  
5. 画面に **Name** と **Value** の入り方が 2 つ並んでいます（古い画面だと左が **Key** と書いてあることもあります）。

   - **Name / Key の欄** … ここに入れる文字列は **Supabase にはありません**。下の表の「左列」を **そのままコピーして貼り付け**ます（例: 最初の 1 回目は `NEXT_PUBLIC_SUPABASE_URL` とだけ入れる）。  
   - **Value の欄** … ここに **Supabase からコピーした値** を入れます（URL や長いトークン）。

   つまり「Key をどこで探すか」ではなく、**左列の名前は決まっているので表からコピー**、「中身の値だけ Supabase で探す」という流れです。

6. **Supabase で Value（URL・キー）を取る場所** … ダッシュボードの見た目はアカウントや時期で少し違います。次の **A か B** のどちらかに当てはまる画面を探してください。

   ---

   **A. 「API Keys」という専用ページがある場合（いまよくある構成）**

   1. [Supabase Dashboard](https://supabase.com/dashboard) で **プロジェクト** を開く  
   2. 左サイドバー最下部付近の **⚙️ Project Settings** をクリック  
   3. 左メニューから **API Keys** をクリック  
      （URL が `.../settings/api-keys` のようなページです）
   4. **Project URL** … このページまたは **Settings → General** / **Data API** にある `https://xxxxx.supabase.co` をコピー → Vercel の `NEXT_PUBLIC_SUPABASE_URL`  
   5. **2 本目**（公開用・ブラウザ向け） …  
      - **Publishable key**（`sb_publishable_...`）を **Copy** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` に貼る  
      - または、このページ内の **Legacy** 系のタブ / 折りたたみに **anon** キー（長い `eyJ...`）があるならそれでもOK（どちらか **1つ**）  
   6. **3 本目**（サーバー専用・秘密） …  
      **Secret keys** の **default** など **Secret**（`sb_secret_...`）を **Reveal → Copy** → `SUPABASE_SERVICE_ROLE_KEY`  
      - または **Legacy** の **service_role**（長い `eyJ...`）でもOK（どちらか **1つ**。**見せたり GitHub に書かない**）

   ---

   **B. 古い「1ページに全部ある API」画面の場合**

   1. **Project Settings** → 左メニュー **API**（または **Data API**）  
   2. **Project URL** … ページ上段 → `NEXT_PUBLIC_SUPABASE_URL`  
   3. **Project API hooks** などの見出しの下に **anon** **public** と **service_role** の欄があり、**Reveal** で表示 → それぞれ 2・3 本目の Value  

   ---

   **まとめ（Vercel に入れる対応）**

   | Name / Key に貼る文字（変えない） | Value に入れるもの |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | **Project URL**（`https://....supabase.co`） |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Publishable**（`sb_publishable_...`）**または Legacy の anon**（長い JWT） |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret**（`sb_secret_...`）**または Legacy の service_role**（長い JWT） |

7. 各変数で **Environment** のうち少なくとも **Production** にチェックが入っていることを確認して **Save** する（開発用に Preview / Development へも同じ値を入れておくと便利なことがありますが必要ならでOK）。

8. **重要:** 環境変数を追加・変更したあとは、すでにデプロイ済みなら **再デプロイ**しないとアプリに反映されないことがあります。  
   - プロジェクトの **Deployments** タブ → いちばん上のデプロイの **…** メニューから **Redeploy**  
   または、空コミットを GitHub に push して自動デプロイしてもOKです。

---

**ローカル（自分の PC）で `npm run dev` するとき**

- リポジトリ直下に **`.env.local`** を作り、同じ **名前 3つ**に Supabase の値を書きます。  
- 雛形: `cp .env.local.example .env.local` を実行してから、中身を編集してください。

---

**よくあるつまずき**

- **anon / service_role が見つからない** … **Project Settings → API Keys** を開き、**Publishable** を anon 代わり、**Secret** を service_role 代わりに使えます。または同じ画面の **Legacy** に **anon** と **service_role** があります。**Data API** だけのメニューしか無い場合は **API** や **General** に **Project URL** があるのでそこも確認してください。  
- **「Key がどこにあるの？」** … Vercel の **Name / Key** の欄に入れるのは **表の左列 3つ**です。どこかに書いてあるのを探すのではなく、**この README の表からコピー**して貼ります。Supabase 側にあるのは **Value（URL とトークン）** だけです。  
- **名前を間違える** … `NEXT_PUBLIC_` まで含めて表のとおりに。**大文字・小文字もそのまま**です。  
- **`service_role` をブラウザやクライアントのコードに書かない** … あくまで Vercel の **サーバー側**（このアプリでは保護者紐付けなど）だけが使います。

---

### ステップ F：Vercel でデプロイする

1. Vercel **Add New → Project**
2. **GitHub のリポジトリ** を選ぶ（`juku`）
3. Framework は自動で Next.js と認識される → **Deploy**
4. 完了後に表示される URL（例: `https://juku-xxxxx.vercel.app`）が **本番のアドレス**

**もう一度 Supabase に戻る**: **Authentication → URL Configuration** の **Site URL** を  
`https://juku-xxxxx.vercel.app` のように **今の本番 URL** に合わせる。  
**Redirect URLs** にも `https://juku-xxxxx.vercel.app/**` を追加。

---

### ステップ G：スタッフ用アカウントをつくる

1. ブラウザで `https://（本番URL）/login` を開く
2. **新規登録**で、スタッフ用メールとパスワードを登録  
   （メール確認 ON なら、届いたメールのリンクをクリック）
3. ログインできれば、ホーム・生徒一覧が見られればOK

**注意**: 公開サイトに「誰でも新規登録」を置きたくない場合は、Supabase **Authentication** で **Disable sign ups** を検討し、ユーザーを **ダッシュボードから招待**する運用にします。

---

### ステップ H：保護者ログインを試す（紐付けから）

1. **保護者用**に別のメールで、同じく **新規登録**（または Supabase でユーザーを追加）
2. **スタッフでログイン** → 生徒を開く → **生徒情報の編集**へ
3. ページ下の **「保護者ログインとの紐付け」** に保護者のメールを入れて **紐付けを追加**  
   - ここで **サービスロール** を使うため、Vercel に **`SUPABASE_SERVICE_ROLE_KEY` が無いと失敗**します
4. シークレットウィンドウで **保護者のメールでログイン** → 自動で **`/parent`（お子様の予定）** が開く

保護者に渡す URL の例:

- **予定だけ見る**: `https://（本番URL）/parent`（ログイン後）
- **振替申請だけ**（ログイン不要）: `https://（本番URL）/apply`

---

### ステップ I：うまくいかないとき

| 症状 | よくある原因 |
| --- | --- |
| Vercel で `500` / `MIDDLEWARE_INVOCATION_FAILED` | 多くの場合 **本番に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が無い**（名前ミス・Production 未チェック・**保存後に Redeploy していない**）。Settings → Environment Variables を確認し **Redeploy**。最新コードでは設定不足時に **日本語の 503 文言**が出ることもあります。 |
| ステップ C で `account_role` / `is_staff_user` エラー | 旧順序の `schema.sql` を流した。**最新の `schema.sql` で全文 Run**。または `supabase/patches/step_c_account_role_then_is_staff_user.sql` を先に Run してから全文再実行。 |
| 紐付けで「ユーザーが見つからない」 | そのメールのユーザーが **Supabase Auth にまだ無い** |
| 紐付けでキー／権限エラー | Vercel に **`SUPABASE_SERVICE_ROLE_KEY` 未設定** |
| ログイン後まっしろ／エラー | **`schema.sql` を本番 Supabase に未実行**、または Auth の **Site URL** が本番と一致していない |
| メールが来ない | Confirm email ON なのに SMTP 未設定・迷惑メールフォルダ |
| コマ時刻 CSV で `lesson_date` 列が schema cache に無い | 本番 Supabase が旧スキーマのまま。**`supabase/classroom_period_times_migrate_to_lesson_date.sql`** を SQL Editor で全文 Run（詳細はセクション **9-3** の見出し参照） |

---

## 7. デプロイ（要点だけ）

- ホスティングは **Vercel 推奨**。GitHub と連携し、**環境変数 3つ** を忘れずに。
- 本番では **メール確認 ON + Custom SMTP（Resend 等）** を強く推奨（README の「5. 開発チェックリスト」も参照）。

### 本番でスタッフ・保護者に渡す URL（まとめ）

| 相手 | URL | 補足 |
| --- | --- | --- |
| スタッフ | `https://（本番）/login` | 生徒・振替枠・CSV など |
| 保護者（予定閲覧） | `https://（本番）/login` → ログイン後 `/parent` | 事前に **生徒編集で紐付け**が必要 |
| 保護者（振替申請） | `https://（本番）/apply` | **ログイン不要**・QR で共有可 |

**旧 README の注意**（以下はコード反映済みのため差し替え済み）  
~~保護者がダッシュボードに入ると全生徒が見える~~ → いまは **`account_role` と RLS** で、保護者は **紐付けたお子様のみ**閲覧できます。

---

## 8. 次にやると良いこと

実装済み：
- [x] 授業記録の **編集 / 削除** UI
- [x] 生徒情報の編集
- [x] 月単位の出席カレンダー表示（予定は枠線で区別）
- [x] 進捗メモのキーワード検索
- [x] 出席率の表示（記録済みのみで集計）
- [x] **科目** カラム（プログラミング / ロボットの2教科限定）+ 科目別フィルタ
- [x] **生徒の受講教科**（複数選択、生徒一覧/詳細にチップ表示、教科でフィルタ）
- [x] **授業の予定 / 記録済み 種別** + 「今後の予定」セクション + 予定→記録済みへの変換ボタン
- [x] **日毎のコマ表カルーセル**（1コマ = 1カードで横スライド、生徒・科目・使用テキストが一目で）
- [x] **使用テキスト**（`textbook`）と **コマ番号**（`period` 1〜10）カラム
- [x] **削除前の確認ダイアログ**（生徒削除 / 授業記録削除 / 予定削除すべて、キャンセル時はデータ保持）
- [x] **所属教室マスタ**（8教室）と **生徒登録時の教室選択**（教室の開講教科のみが受講教科候補に）
- [x] **生徒一覧の教室絞り込み**（教室別チップ + select、未設定の生徒も抽出可）
- [x] **教室バッジ**（生徒詳細・一覧・コマ表カルーセル・直近授業行に色付きバッジで表示）
- [x] **振替枠の管理ページ**（`/capacities`、教室・曜日・コマ・教科ごとに最大受け入れ人数）
- [x] **保護者向け振替申請フォーム**（`/apply`、認証不要、3 ステップ: 本人確認 → 日付 → 空きコマ）
- [x] **空き状況のリアルタイム更新**（Supabase Realtime + 30 秒ポーリングのハイブリッド）
- [x] **容量チェック付き予約**（DB 関数で同時申請のレース防止、満員時はエラー）

未実装：
- [x] **保護者ログイン**（`/parent`：紐付けたお子様の予定のみ）と RLS・`parent_student_links`・`account_role`
- [ ] 講師ごとの色分け / プロフィール (`teacher_profiles.display_name` の編集 UI)
- [ ] 月単位の集計を CSV / PDF エクスポート（保護者報告向け）
- [ ] Resend 等の SMTP 設定（本番用）

---

## 9. データベースの差分マイグレーション

スキーマ変更がある度に **Supabase の SQL Editor で `supabase/schema.sql` 全文を再 Run** すれば冪等に適用されます。最小だけ流したい場合の差分:

### 9-1. コマ表 + 使用テキスト

```sql
alter table public.lessons add column if not exists period   smallint;
alter table public.lessons add column if not exists textbook text;

do $$ begin
  alter table public.lessons add constraint lessons_period_check
    check (period is null or (period between 1 and 10));
exception when duplicate_object then null; end $$;

create index if not exists lessons_date_period_idx on public.lessons (lesson_date, period);
```

### 9-2. 所属教室

```sql
alter table public.students add column if not exists classroom text;

do $$ begin
  alter table public.students add constraint students_classroom_check
    check (classroom is null or classroom in (
      '長浜八幡中山教室',
      '長浜駅前通り教室',
      '米原駅前教室',
      '米原長岡教室',
      '西宮鳴尾町教室',
      '出屋敷教室',
      '長浜神照教室',
      '学校法人芦屋学園芦屋大学附属幼稚園教室'
    ));
exception when duplicate_object then null; end $$;

create index if not exists students_classroom_idx on public.students (classroom);
```

> 既存の生徒は `classroom IS NULL` のままなので、生徒一覧 → 「教室未設定」チップから該当生徒を見つけて編集 → 教室を割り当てると整理しやすいです。

### 9-2b. ロボット / プログラミング「次回テキスト」（生徒）

生徒編集のプルダウン用。

- ロボット列のみ未適用: **`supabase/patches/students_next_text_robot.sql`**
- プログラミング列のみ未適用: **`supabase/patches/students_next_text_programming.sql`**

いずれも SQL Editor で全文 Run。または最新の **`supabase/schema.sql`** 全文で両方まとめて追加されます。候補は **`大枠 / 単元`**（プログラミング・ロボットの非2周）、ロボットの（2周）は **`大枠 / 1周目または2周目 / 単元`**（計: ロボット 198・プログラミング 128）。PostgreSQL の `CHECK` を同じ集合に合わせるには、変更後に **`npm run gen:next-text-sql`** で `supabase/generated/*.inc.sql` を再生成し、**`schema.sql` の該当 `check` ブロックを差し替える**か、**`supabase/patches/students_next_text_robot.sql`** と **`students_next_text_programming.sql`** を再生成して Run してください（既存の旧形式の値はパッチで NULL になります）。

### 9-3. 振替枠 + RPC + Realtime（保護者向けフォーム用）

`supabase/schema.sql` 全文を再 Run するのが最も簡単です。重要なのは下記:

1. `public.lesson_capacities` テーブル（CHECK + UNIQUE 制約 + updated_at トリガー）
2. SECURITY DEFINER 関数（`find_student_for_makeup`, `list_scheduled_lessons_for_makeup`, `get_makeup_availability`, `book_makeup_lesson`, `weekday_occurrence_in_month`）の作成と `anon, authenticated` への `grant execute`
3. `lesson_capacities` の RLS（authenticated 読込 + admin 書込）
4. `supabase_realtime` publication への `public.lessons` の追加（リアルタイム空き更新のため）

Realtime を有効化していないプロジェクトでも、保護者フォームは 30 秒間隔でポーリングするフォールバックで動作します。

#### SQL Editor で `relation "public.lesson_capacities" does not exist` が出たとき

RPC ファイル（`rpc_makeup_functions_only.sql`）だけを先に流すと、このエラーになります。**先にテーブルを作ってください。**

1. **`supabase/lesson_capacities_table_and_rls.sql`** を SQL Editor で **全文** Run（`lesson_capacities` + RLS + Realtime）
2. 続けて **`supabase/rpc_makeup_functions_only.sql`** を **全文** Run

`public.is_admin()` が無いプロジェクトでは ① の RLS 作成で失敗します。その場合は一度 **`schema.sql` の「teacher_profiles / is_admin」まで** を先に適用してください。

#### コマ時刻 CSV で `Could not find the 'lesson_date' column of 'classroom_period_times' in the schema cache` が出たとき

接続先の Supabase に **`classroom_period_times.lesson_date` 列がまだ無い**状態です（PostgREST のスキーマキャッシュが旧テーブル定義のまま）。アプリは **暦日 `lesson_date` 版**を前提に insert しています。

**対処:** Supabase **SQL Editor** でこのリポジトリの **`supabase/classroom_period_times_migrate_to_lesson_date.sql`** を **全文** Run してください。末尾の `notify pgrst, 'reload schema';` で API 側のキャッシュが更新されます。

- テーブルが旧仕様（`day_of_week` / `week_ordinals`）のままの場合、この移行で **コマ時刻データはいったん空になります**（ファイル内コメントどおり）。**CSV から取り直してください。**
- 新規に近いプロジェクトでテーブル未作成なら、代わりに **`supabase/classroom_period_times_table_and_rls.sql`** を Run しても構いません（`lesson_date` 付きで作成されます）。
- どちらでも直らない場合は、ダッシュボードで **Table Editor** を開き、`classroom_period_times` に **`lesson_date`（date）** があるか確認してください。

#### SQL Editor で `unterminated dollar-quoted string` が出たとき

エラーメッセージの途中に `-- Added by Supabase` や `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` が **関数定義の途中** に挟まっている場合、SQL が途中で切れて `$$` が閉じていません。**ダッシュボードが別ウィンドウで生成した SQL と混ぜて貼り付けていないか**、または **選択範囲が途中まで** になっていないかを確認してください。

対処:

1. **プロジェクトの** `supabase/rpc_makeup_functions_only.sql` をエディタで開き、**ファイル全文を一度に** SQL Editor に貼り付けて Run（3 つの `create or replace function` と `grant` だけが入っています）。
2. リポジトリを pull したあと、`schema.sql` も **タグ付きドルクォート**（`$get_makeup$` … `$get_makeup$` など）に更新済みです。全文 Run する場合は最新版を使ってください。

---

## 10. 保護者フォームの運用

### 公開 URL

- 開発: `http://localhost:3000/apply`
- 本番: `https://<your-vercel-domain>/apply`

このページは middleware で `/apply` を public パスに登録しており、未ログインでもアクセス可能です。
保護者には QR コードや LINE 等で URL を共有してください。

### 申請の流れ（保護者視点）

1. お名前 + 所属教室 + 学年 を入力 → 本人確認（`find_student_for_makeup` RPC）
2. **欠席する元の授業**を、出席予定のカードから選ぶ（または手入力）
3. **振替先の日付**を選ぶ（今日〜およそ 4 ヶ月〈120 日〉先まで。日付入力または日付帯から選択）
4. その日に開講しているコマと教科ごとに「空きN / 満員」が表示される
5. 空きのあるコマをタップ → ブラウザ confirm 確認 → 予約完了

予約は `lessons` テーブルに `attendance='makeup'` `status='scheduled'` で挿入されるので、
講師ダッシュボード（ホームのコマ表カルーセル / 生徒詳細の「今後の予定」）に即座に現れます。

### 設定の流れ（教室管理者視点）

1. ヘッダーの **「振替枠」** リンク → `/capacities`
2. 「新規追加」フォームで教室・曜日・コマ・教科・最大人数を入力
3. 既存の枠は管理者のみ編集・削除可能
4. 一度設定すれば該当の曜日には自動で適用される（毎週同じ時間割が前提）

### 申請受付後の運用

- 講師は通常通り `/students/[id]` で生徒を開き、「今後の予定」から `attendance='makeup'` の行を確認
- 当日になったら通常の出欠記録と同じように「記録済みに」ボタンで確定
- キャンセルしたい場合は予定を削除すると、空き枠がその瞬間に空いて他の保護者が申請できるようになる
