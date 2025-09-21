# 使い方（http-server）

このリポジトリは Three.js を CDN から読み込み、TypeScript を素の JS に変換して動かします。`npx http-server` でローカル配信して確認してください。

## 前提
- Node.js がインストール済み
- TypeScript のビルドは `tsc`（グローバル）または `npx tsc` を使用

## 手順
1) ビルド
- 初回/変更時: `tsc` または `tsc -p .`
- 監視ビルド（任意）: `tsc -w` または `tsc -p . -w`
  - 本リポジトリの `tsconfig.json` は `module: none` を指定しており、ブラウザ向けに `main.js` を出力します。

2) サーブ
- ルートで: `npx http-server -p 8080`
- ブラウザで: `http://localhost:8080/` を開く（`index.html` が自動表示されます）
- ポートが埋まっている場合は `-p 3000` など任意のポートに変更

## 補足
- `index.html` は Three.js（CDN）→ `main.js` の順で読み込みます。`main.ts` はグローバル `THREE` を使用しており、`import` は不要です。
- `file://` で直接開くと CORS などで不安定になるため、必ずローカルサーバー経由で開いてください。

## 操作方法（最小仕様）
- クリック: マウスカーソルをロック（視点操作が有効化）
- 視点: マウス移動
- 移動: `W/A/S/D`
- 走る: `Shift`
- ジャンプ: `Space`
- 破壊: 左クリック（クロスヘア先のブロック）
- 設置: 右クリック（ヒット面の隣に設置、リーチ約5m）
