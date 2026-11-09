# 佐藤さんの共通人物素材v2（2026-11-09）

ユーザー承認のもと組み込みGPT Imageで4表情を再生成しました。スーパー・書店・駅で共通利用する普段の外出着と立ち姿です。背景は従来のままです。現在の表示は下表のWebPを使用します。

| 表情 | 生成PNG原本 | 配信用WebP |
| --- | --- | --- |
| neutral | sato-neutral-v2.png | sato-neutral-v2.webp |
| confused | sato-confused-v2.png | sato-confused-v2.webp |
| cautious | sato-cautious-v2.png | sato-cautious-v2.webp |
| relieved | sato-relieved-v2.png | sato-relieved-v2.webp |

4枚とも1086×1448のRGBA PNGで、背景の透明画素を確認しました。PNGからWebPへの変換は可逆圧縮で、寸法・アルファ・可視RGBの一致を確認しています。元のv1素材は同じフォルダーに保存しています。

実際のプロンプトと参照画像の対応は `docs/portrait-generation-20261109.json`、作業内容と検証範囲は `docs/portrait-refresh.md` を参照してください。

## 以前の素材記録（以下は旧版）

# 書店の写実的2.5D素材（配置済み）

ユーザー提供のPNG原本をDownloadsからコピーしました。原本のリネーム・画像編集・再生成は行っていません。
画像パスは `src/bookstore.config.ts` に集約しています。

配信用には同じフォルダーに同名の `.webp` を追加し、現在の画面はWebPを使います。下表のPNG原本は変更していません。可逆圧縮・透過検証・再変換手順は `docs/scene-image-delivery.md` を参照してください。

| 用途 | 提供元ファイル（Downloads内） | 保存先 |
| --- | --- | --- |
| 背景 | ChatGPT 画像 2026年11月8日 16_52_07-1.png | public/bookstore/bookstore-bg.png |
| neutral：通常 | ChatGPT 画像 2026年11月8日 16_52_15-2.png | public/bookstore/sato-neutral.png |
| confused：困惑 | ChatGPT 画像 2026年11月8日 16_52_31-5.png | public/bookstore/sato-confused.png |
| cautious：警戒 | ChatGPT 画像 2026年11月8日 16_52_25-3.png | public/bookstore/sato-cautious.png |
| relieved：安心 | ChatGPT 画像 2026年11月8日 16_52_28-4.png | public/bookstore/sato-relieved.png |

## 素材と表示

- 背景：1672×941、RGB。会話画面全体にobject-fit: coverで表示。
- 人物：4点とも1086×1448、RGBA。左上画素のアルファ0を確認。背景と別のレイヤーに配置。
- 全表情で同じ3:4の表示枠と中央揃えを共有。顔のポーズ自体には素材由来のわずかな差があります。
- PCは最大幅620px、スマートフォンは画面幅94%（最大430px）。テキストUIは濃色パネルを重ねて表示。
- 表情フェード、背景ズーム、画面フェード、既存の動き軽減設定を維持。
- 旧SVGは過去の試作資料で、現在の画面から参照していません。

## 会話接続仕様（変更なし）

BookstoreResponse は reply（文字列）、expression（neutral / confused / cautious / relieved）、conversationEnded（真偽値）です。
BookstoreStage はこの応答とreducedMotionを受け取る表示用コンポーネントです。
書店デモは src/bookstore.demo.ts の仮返答を使用。既存の会話ロジック、バックエンド、Gemini API、Firebase設定は今回変更していません。

## 検証の範囲

素材ファイル、寸法、透過形式、保存前後のハッシュを確認します。
PC・スマートフォンの実ブラウザ表示は、ブラウザ操作接続が利用できないため未確認です。
実機で顔の見切れ、表情クロスフェード、入力と送信、動きを抑える操作を確認する必要があります。
