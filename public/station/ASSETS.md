# 山本さんの共通人物素材v2（2026-11-09）

ユーザー承認のもと組み込みGPT Imageで4表情を再生成しました。スーパー・書店・駅で共通利用する普段の外出着と立ち姿です。背景は従来のままです。現在の表示は下表のWebPを使用します。

| 表情 | 生成PNG原本 | 配信用WebP |
| --- | --- | --- |
| neutral | yamamoto-neutral-v2.png | yamamoto-neutral-v2.webp |
| confused | yamamoto-confused-v2.png | yamamoto-confused-v2.webp |
| cautious | yamamoto-cautious-v2.png | yamamoto-cautious-v2.webp |
| relieved | yamamoto-relieved-v2.png | yamamoto-relieved-v2.webp |

4枚とも1086×1448のRGBA PNGで、背景の透明画素を確認しました。PNGからWebPへの変換は可逆圧縮で、寸法・アルファ・可視RGBの一致を確認しています。元のv1素材は同じフォルダーに保存しています。

実際のプロンプトと参照画像の対応は `docs/portrait-generation-20261109.json`、作業内容と検証範囲は `docs/portrait-refresh.md` を参照してください。

## 以前の素材記録（以下は旧版）

# 駅の2.5D画像素材（生成・配置済み）

このフォルダーは新規素材専用です。書店の佐藤さんの画像を流用・上書きしません。
GPT Imageの組み込み画像生成機能で背景1枚と人物4枚を実際に生成し、以下のパスへ保存しました。

配信用には同じフォルダーに同名の `.webp` を追加し、現在の画面はWebPを使います。下表のPNG原本は変更していません。可逆圧縮・透過検証・再変換手順は `docs/scene-image-delivery.md` を参照してください。

| 保存先 | 用途 |
| --- | --- |
| public/station/station-bg.png | 写実的な駅の背景 |
| public/station/yamamoto-neutral.png | 山本さん（架空の76歳の女性）の通常表情 |
| public/station/yamamoto-confused.png | 少し困惑した表情 |
| public/station/yamamoto-cautious.png | 警戒・戸惑いの表情 |
| public/station/yamamoto-relieved.png | 安心した表情 |

背景は16:9の横長、推奨1920×1080以上。人物を中央に置ける余白を残してください。
人物は全4枚とも同一人物・服装・髪型・体格で、3:4の同じキャンバスサイズ（推奨1200×1600）に統一。
背景は完全透過PNGで、頭頂・顔・肩・足元の位置を揃えてください。
顔の表情は控えめで自然にし、認知症や医学的症状を外見で表現・誇張しないでください。

パス設定と人物設定：src/conversation-scenarios.ts。
背景は1672×941 RGB、人物は全4枚1086×1448 RGBA PNGです。人物の透明画素を検証済み。通常表情を参照して差分を生成しました。

再生成用プロンプトは同フォルダーのGENERATED_PROMPTS.mdを参照してください。
PC・スマートフォンの実ブラウザ確認は接続不良により未実施です。


## 今回の駅専用差し替え

5枚とも今回新たに生成して上記パスへ差し替えました。旧素材はoutput/replaced-assets/station-20261108-v1/に退避しています。
人物は全4枚1086×1448、RGBAで透明画素を確認済みです。背景は1672×941。
既存の表情状態・表示枠・会話ロジックを維持し、スマホのみ背景のobject-positionを38%へ調整しました。
田中さん・佐藤さんの画像とシナリオ設定は変更していません。
ブラウザへの接続不良により、実画面での表情フェードおよびPC・スマホのレイアウト確認は未実施です。
