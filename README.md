# Swift Notes

Fast Notion風のローカルWebノートアプリです。データはブラウザのローカル保存に入るため、サーバーやアカウントなしで使えます。

## 機能

- タイトルだけの高速入力
- `Cmd+Enter` でNotionへ送信
- `タスク` / `メモ` / `アイデア` の送信ボタン
- 送信履歴サイドバー
- 自動保存
- Notion接続設定を設定画面に格納
- 送信時にNotionの日付プロパティへ送信日を自動入力
- スマホ向けレイアウト
- ホーム画面に追加しやすいPWA設定

## 起動方法

Node.js `>=22.13.0` が必要です。

```bash
npm install
npm run dev
```

起動後、表示されたローカルURLをブラウザで開きます。

### スマホで使う

Macとスマホを同じWi-Fiにつないでから、Macで次を実行します。

```bash
npm run dev:mobile
```

表示されたNetwork URL、またはMacのIPアドレスを使ってスマホで開きます。

例:

```text
http://192.168.x.x:3000
```

iPhoneならSafariで開き、共有ボタンから「ホーム画面に追加」を選ぶと、アプリのように起動できます。

## Notion接続

NotionのPersonal Access TokenまたはInternal Integration Tokenを入力し、送信先データベースのURLまたはIDを指定すると、現在のノートをNotionデータベースへ送信できます。

1. Notion側でトークンを作成します
2. Internal Integration Tokenの場合は、対象データベースを接続に共有します
3. Swift Notesの `Notionトークン` にトークンを入力します
4. `データベースURLまたはID` にNotionデータベースのURLか長いIDを入力します
5. `接続を確認` すると、アプリが送信用IDとタイトル列名をできるだけ自動で補完します
6. タイトル入力欄に送信したい内容を入れます
7. `タスク` / `メモ` / `アイデア` のどれかでNotionへ新規ページを作成します

- トークンは `sessionStorage` のみに保存し、ブラウザを閉じると消えます
- トークンはアプリのノートデータには保存しません
- Notion APIへの通信はローカルAPI経由で行い、送信結果URLだけをノートに保存します
- Notion接続には対象データベースへの読み取り権限と追加権限が必要です
- Notionデータベース内に日付プロパティがある場合、送信時の日付を自動で入れます

## 確認

```bash
npm run build
npm test
```
