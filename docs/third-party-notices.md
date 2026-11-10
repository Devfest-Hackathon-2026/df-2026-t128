# ブラウザ配布物の第三者ライセンス

公開画面のフッターにある「OSSライセンス」から、`public/THIRD_PARTY_NOTICES.txt` を新しいタブで開けます。Viteが同ファイルを `dist` にコピーし、Cloud RunのExpressが静的ファイルとして配信します。READMEのリンクからも元ファイルを確認できます。

## 今回の対象

現行フロントエンドの出力に含まれるReact 19.3.1、React DOM 19.3.1、Scheduler 0.28.0、Vite 8.3.6のmodulepreload polyfill、Rolldown 1.2.16のruntime helperを対象にしています。各npmパッケージに含まれる正式なLICENSEを、著作権表示・許諾文・免責文を省かず保持します。ViteのLICENSE.mdとRolldownのTHIRD-PARTY-LICENSEは、上流配布物内の追加通知も丸ごと保持しています。そのすべてがこのブラウザの出力に含まれるという意味ではありません。

元のアプリコード、画像・音声等の権利を変更するものではありません。プロンプトインジェクション検査は独自実装で、既製品のコード・パターン集を導入していません。設計上の参考は[対策の説明](prompt-injection-defense.md)に記載しています。サーバー専用依存は本番の `npm ci --omit=dev` により各パッケージのLICENSEと一緒にインストールされます。

## 更新と検証

1. `npm ci` でlockfileに沿って依存を入れます。
2. 依存の変更時は、ブラウザに新しく含まれるパッケージ・runtime helperと、そのライセンス条件を確認します。対象の固定リストは `scripts/third-party-notices.mjs` にあります。現在の一覧で将来の依存も自動的に網羅できるとは限りません。
3. `npm run licenses:generate` でインストール済みパッケージの正式ファイルから通知を生成し、差分をレビューします。外部サービスへ接続せず、改めてパッケージを取得しません。
4. `npm test`、`npm run build`、`node scripts/deployment-smoke.mjs` を実行します。

buildは `npm run licenses:check` を先に実行し、通知の欠落・編集、パッケージバージョンの不一致、上流LICENSEまたはlockfileの変更を検出したら停止します。検査は通知を自動修正しません。smokeはビルド後のHTTPレスポンスが元の通知と完全に一致し、HTMLへのフォールバックではないことも確認します。
