# ASOBI Lab. 取扱説明書 — 目次・用語集

<p class="doc-subtitle">Web サービス ASOBI Lab.（生徒・授業管理システム）マニュアル一覧</p>

<table class="doc-meta">
  <tr><th>ドキュメント種別</th><td>目次・用語集</td></tr>
  <tr><th>バージョン</th><td>1.0</td></tr>
  <tr><th>最終更新</th><td>2026年6月</td></tr>
</table>

---

## マニュアル一覧

<table>
  <thead>
    <tr>
      <th style="width:22%">ドキュメント</th>
      <th style="width:18%">対象</th>
      <th>主な内容</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>01-管理者用</strong></td>
      <td>教室管理者・システム担当</td>
      <td>初期設定、マスタ管理、権限、運用方針、<strong>スタッフ向け説明会の台本</strong></td>
    </tr>
    <tr>
      <td><strong>02-スタッフ用</strong></td>
      <td>講師・教室スタッフ</td>
      <td>日常業務（コマ表、生徒管理、出席確認、振替対応）</td>
    </tr>
    <tr>
      <td><strong>03-保護者用</strong></td>
      <td>保護者</td>
      <td>振替申請（ログイン不要）、予定確認（ログイン必要）</td>
    </tr>
  </tbody>
</table>

> **PDF 版** … 同フォルダ内 `pdf/` に各マニュアルの PDF を出力しています。

---

## 共有 URL（本番環境）

<table>
  <thead>
    <tr>
      <th>用途</th>
      <th>URL</th>
      <th style="width:18%">ログイン</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>スタッフ・管理者</td>
      <td><code>https://（本番ドメイン）/login</code></td>
      <td>必要</td>
    </tr>
    <tr>
      <td>保護者（予定確認）</td>
      <td>上記ログイン後 <code>/parent</code></td>
      <td>必要（事前紐付け）</td>
    </tr>
    <tr>
      <td>保護者（振替申請）</td>
      <td><code>https://（本番ドメイン）/apply</code></td>
      <td><strong>不要</strong></td>
    </tr>
  </tbody>
</table>

---

## 用語集

<table>
  <thead>
    <tr>
      <th style="width:22%">用語</th>
      <th>意味</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>コマ表</strong></td>
      <td>ホーム画面の「本日のコマ表」。教室 × 教科 × コマごとに生徒を表示</td>
    </tr>
    <tr>
      <td><strong>レギュラーコマ</strong></td>
      <td>生徒登録時に設定する「毎週の出席コマ」（第1・3週 or 第2・4週 × 曜日 × コマ）</td>
    </tr>
    <tr>
      <td><strong>振替枠</strong></td>
      <td>振替申請で受け入れ可能な人数の上限（教室・曜日・週・コマ・教科ごと）</td>
    </tr>
    <tr>
      <td><strong>コマ時刻</strong></td>
      <td>各日・各コマの開始・終了時刻（コマ表の時刻表示・出席予定の自動作成に使用）</td>
    </tr>
    <tr>
      <td><strong>出席予定</strong></td>
      <td>システムが自動作成した予定（出欠：出席予定）</td>
    </tr>
    <tr>
      <td><strong>欠席予定</strong></td>
      <td>振替申請などで欠席が確定した予定（コマ表では灰色カード）</td>
    </tr>
    <tr>
      <td><strong>振替予定</strong></td>
      <td>振替先として予約された授業</td>
    </tr>
  </tbody>
</table>

<p class="footer-note">ASOBI Lab. 取扱説明書 — 2026年6月版</p>
