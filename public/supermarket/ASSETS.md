# スーパーの2.5D画像素材（生成・配置済み）

このフォルダーは新規素材専用です。書店の佐藤さんの画像を流用・上書きしません。
GPT Imageの組み込み画像生成機能で背景1枚と人物4枚を実際に生成し、以下のパスへ保存しました。

配信用には同じフォルダーに同名の `.webp` を追加し、現在の画面はWebPを使います。下表のPNG原本は変更していません。可逆圧縮・透過検証・再変換手順は `docs/scene-image-delivery.md` を参照してください。

| 保存先 | 用途 |
| --- | --- |
| public/supermarket/supermarket-bg.png | 写実的なスーパーの背景 |
| public/supermarket/tanaka-neutral.png | 田中さん（架空の78歳の女性）の通常表情 |
| public/supermarket/tanaka-confused.png | 少し困惑した表情 |
| public/supermarket/tanaka-cautious.png | 警戒・戸惑いの表情 |
| public/supermarket/tanaka-relieved.png | 安心した表情 |

背景は16:9の横長、推奨1920×1080以上。人物を中央に置ける余白を残してください。
人物は全4枚とも同一人物・服装・髪型・体格で、3:4の同じキャンバスサイズ（推奨1200×1600）に統一。
背景は完全透過PNGで、頭頂・顔・肩・足元の位置を揃えてください。
顔の表情は控えめで自然にし、認知症や医学的症状を外見で表現・誇張しないでください。

パス設定と人物設定：src/conversation-scenarios.ts。
背景は1672×941 RGB、人物は全4枚1086×1448 RGBA PNGです。人物の透明画素を検証済み。通常表情を参照して差分を生成しました。

再生成用プロンプトは同フォルダーのGENERATED_PROMPTS.mdを参照してください。
PC・スマートフォンの実ブラウザ確認は接続不良により未実施です。
