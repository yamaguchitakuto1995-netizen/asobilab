# Wan Studio — Script to Video（Vidu風）

`/studio` で **脚本 → シーン分割 → Wan 2.2（RunPod）で各カット生成** ができます。

Vidu の Script to Video と同じく、「長い脚本を一発で動画化」ではなく **ショット単位で生成して並べる** 設計です。

## 使い方

1. http://localhost:3000/studio を開く
2. **Script** タブに脚本を貼る（空行や `シーン1` / `INT.` で分かれやすい）
3. **Visual style** を指定（例: cinematic / anime）
4. **1. 脚本をシーン分割** → ストーリーボードが作られる
5. 各シーンの `visualPrompt` を必要なら編集
6. **2. 全シーンを動画化** → RunPod の Wan 2.2 で順次生成
7. 右の Timeline でカットを確認

単発の Text to Video / Image to Video も同じ画面のタブから使えます。

## 環境変数

```env
# 必須（本番生成）
RUNPOD_API_KEY=
RUNPOD_WAN_ENDPOINT_ID=

# 未設定時はデモ動画で UI 確認（本番は false）
STUDIO_ALLOW_MOCK=true

# 任意: シーン分割を LLM で賢くする（未設定ならヒューリスティック）
OPENAI_API_KEY=
# または OpenAI 互換
STUDIO_LLM_API_KEY=
STUDIO_LLM_BASE_URL=https://api.openai.com/v1
STUDIO_LLM_MODEL=gpt-4o-mini
```

## フロー図

```text
脚本テキスト
  → /api/studio/script-plan  （シーン分割 + 映像プロンプト）
  → ストーリーボード編集
  → /api/studio/generate × N （各シーンを Wan 2.2 / RunPod）
  → Timeline プレビュー
```

## コツ（Vidu と同じ）

- 1シーン = 1主体 + 1アクション + 1カメラ
- 転換があるならカットを分ける
- スタイル文言は全シーン共通で入れる（モデルは前のカットを覚えない）
- キャラを固定したい場合は、各 `visualPrompt` に同じ外見描写を繰り返す
