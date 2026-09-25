# HyperFrames 動画ツール（HTMLで作る説明動画）

`scripts/retro_video/`（レトロゲーム風）とは別のツールです。
HeyGen が公開している無料のツール **HyperFrames** を使い、Webページ（HTML）として作った画面を1コマずつ撮って mp4 にします。

## レトロ風ツールとのちがい

| | レトロ風（`scripts/retro_video/`） | HyperFrames（このフォルダ） |
|---|---|---|
| 作り方 | Python で1コマずつ点を打って絵を描く | HTML と CSS で画面を作り、GSAP で動かす |
| 見た目 | 320×180 のドット絵を拡大。16色 | 1920×1080 のなめらかな図解・文字。色は自由 |
| 文字 | ドット文字（Unifont） | 普通の日本語フォント（Noto Sans JP） |
| 動き | 自分で1コマずつ位置を計算 | 「0.5秒で下から出す」のように書くだけ |
| 確認の道具 | 静止画を書き出して目で見る | `check` で、はみ出し・重なり・読みにくい色を自動で見つける＋静止画 |
| 必要なもの | Python だけ | Node.js 22 以上、ffmpeg、描画用ブラウザ（自動で入る） |
| 向いている | 物語・キャラクターで楽しく見せる、SNSで目をひく | 手順・数字・図で分かりやすく説明する、お客様向けの資料動画 |

どちらも「動画生成AIを使わずにプログラムで作る」点は同じです。
撮った動画（顔出し・画面録画）を切って編集したいときは、どちらでもなく video-use のような編集ツールが向いています。

## 使い方（line-shiryou の例）

```bash
cd scripts/hyperframes_video/line-shiryou
npm install                 # フォント（Noto Sans JP）と GSAP を入れる
python3 build_assets.py     # 使う文字だけのフォント・BGM・効果音を assets/ に作る
npx hyperframes check       # はみ出し・重なり・色の見やすさを自動で確認
npx hyperframes snapshot --at 7.6,13.2,18.9   # 決めた秒数の静止画を書き出す
npx hyperframes render -q high -o ../../../line_shiryou_explainer.mp4
```

- 文字や秒数を変えるときは `index.html` を書き換えます。文字を変えたら `build_assets.py` をもう一度動かしてください（新しい文字のフォントが入ります）。
- 効果音のタイミングは `build_assets.py` の `build_sfx()` に書いてあります。`index.html` の秒数を変えたら、こちらも合わせてください。
- 絵・動き・音はすべてプログラムで作っています。画像やネットの素材は使っていません。
