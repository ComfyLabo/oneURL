# oneURL サマリー検索

URLを入力すると、そのページの本文を取得して簡易的なサマリーを表示するシンプルなアプリです。検索窓の横にある虫眼鏡アイコンをクリックすると処理が始まり、右側のウィンドウでサマリーを確認できます。

## セットアップ

```bash
npm install
```

環境変数 `GEMINI_API_KEY` に Google AI Studio から取得した API キーを設定してください。

```bash
export GEMINI_API_KEY="your-key"
# 任意: 使用するモデルを指定（既定は gemini-1.5-flash）
export GEMINI_MODEL="gemini-1.5-flash"
```

## 開発サーバーの起動

```bash
npm start
```

ブラウザで <http://localhost:3000> を開いてください。

## Docker を使ったデプロイ

Docker を利用すると、依存関係を含めて一つのコンテナとして実行できます。

```bash
# イメージのビルド
npm install
docker build -t oneurl-app .

# コンテナの起動
docker run --rm -p 3000:3000 -e GEMINI_API_KEY=your-key oneurl-app
```

コンテナが起動したら <http://localhost:3000> でアプリを利用できます。クラウドサービスにデプロイする場合は、このイメージをレジストリにプッシュして各サービスの手順に従ってください。

## Render（例）へのデプロイ

1. Render アカウントで新しい **Web Service** を作成します。
2. リポジトリを選択し、ビルドコマンドに `npm install`、スタートコマンドに `npm start` を設定します。
3. 環境変数 `NODE_VERSION=18` を追加します。
4. 保存してデプロイすると、完了後に発行される URL から利用できます。

## 主な機能

- URL入力欄と虫眼鏡アイコン付き検索ボタン
- エラーメッセージや読み込み中表示などのフィードバック
- 要約結果（タイトル、URL、本文）の表示とリセットボタン

## 実装メモ

- フロントエンドは `public/` 配下に配置しています。
- バックエンドは Node.js/Express を利用し、`/api/summarize` でページを取得・要約します。
- 要約処理は `@mozilla/readability` で本文を抽出し、`GEMINI_API_KEY` が設定されている場合は Gemini API で要約、未設定の場合は簡易ローカルロジックで要約します。

## 注意事項

- 対象サイトの `robots.txt` や利用規約を確認してからご利用ください。
- JavaScriptで生成されるコンテンツなど、HTMLだけでは本文が取得できないページは正しく要約できない場合があります。
- ネットワークアクセスやCORSの制限により、本番環境では追加の設定が必要になることがあります。
