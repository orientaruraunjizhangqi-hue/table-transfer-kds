# 卓移動 KDS（全端末リアルタイム同期版）

卓移動の指示（移動元 → 移動先・性別・メモ）を発行し、全端末でリアルタイムに共有する店舗用システムです。
古い iPad（iOS 9 / 10 の Safari）でも動くように作っています。

- 公開URL: https://orientaruraunjizhangqi-hue.github.io/table-transfer-kds/
- 画面: GitHub Pages（無料）
- データ同期: Firebase Realtime Database（無料 Spark プラン）
  - URL: https://table-transfer-kds-default-rtdb.asia-southeast1.firebasedatabase.app/

## ファイル構成
| ファイル | 内容 | 編集 |
|---|---|---|
| `index.html` | 画面のレイアウト | ○ |
| `app.js` | アプリ本体・同期処理（**ES5 で記述**） | ○ |
| `styles.css` | Tailwind CSS を事前ビルドしたもの | ×（自動生成） |
| `icons.js` | アイコン（Lucide）を内蔵したもの | ×（自動生成） |
| `database.rules.json` | Realtime Database のルール（Firebase コンソールに貼り付けて使用） | |
| `build/` | `styles.css` / `icons.js` を作り直すための道具 | |

## 店舗ごとの使い分け
- 店舗ごとにデータ（伝票・卓設定）が分かれます。同じ店舗の端末どうしだけで共有されます
- 各店舗の URL: `https://orientaruraunjizhangqi-hue.github.io/table-transfer-kds/?store=店舗ID`
  | 店舗 | URL |
  |---|---|
  | 京都 | https://orientaruraunjizhangqi-hue.github.io/table-transfer-kds/?store=kyoto |
  | 神戸 | https://orientaruraunjizhangqi-hue.github.io/table-transfer-kds/?store=kobe |
  | 天満 | https://orientaruraunjizhangqi-hue.github.io/table-transfer-kds/?store=tenma |
- `?store=` なしで開くと店舗選択画面が出ます（選んだ店舗は端末に記憶）
- ヘッダーの店舗名ボタンから切り替え可能

### 店舗を追加するには
`app.js` 上部の `STORES` に1行追加して保存するだけです。
```js
var STORES = [
    { id: 'kyoto', name: '京都' },
    { id: 'kobe', name: '神戸' },
    { id: 'tenma', name: '天満' },
    { id: 'osaka', name: '大阪' }   // ← 追加
];
```
`id` は半角英小文字・数字・`-` `_` のみ。一度使い始めたら変更しないでください（データの保存場所になるため）。

## 修正のしかた
GitHub 上でファイルを開き、鉛筆アイコン（Edit）で編集 →「Commit changes」。1〜2分で自動反映されます。
iPad 側で古い表示が残る場合は、`index.html` 内の `?v=2` の数字を増やすと確実に更新されます。

> [!IMPORTANT]
> 古い iPad で動かすため、`app.js` では **`let` / `const` / `=>`（アロー関数）/ `` ` ``（テンプレート文字列）/ `fetch` を使わないでください**。
> 使うと古い iPad では画面上部に赤いエラーが表示され、動かなくなります。

### 見た目（Tailwind のクラス）を新しく追加した場合
`styles.css` に含まれていないクラスは効きません。`build/build.py` の説明に従って作り直してください（Mac で `python3 build/build.py`）。

## Realtime Database のデータ
| パス | 内容 |
|---|---|
| `/kds/stores/{店舗ID}/orders/{ID}` | 移動オーダー（gender, fromTable, toTable, status, createdAt, completedAt, noteType, textNote, canvasData, no） |
| `/kds/stores/{店舗ID}/tables` | `[{ name, colorId }]` 卓設定・色分け |

Firebase コンソール → Realtime Database →「データ」タブで中身を確認・削除できます。

## 画面の見方
- ヘッダーの表示: 緑「同期中」/ 黄「オフライン」/ 灰「接続中…」/ 赤「同期エラー」
- 一時的に電波が切れても操作でき、復帰時に自動で再送されます
- 通知音は、起動後に画面をどこか1回タップすると鳴るようになります（iOS の仕様）
- 通知音 ON/OFF・デモ移動は端末ごとの設定

## 運用のコツ（iPad）
- 「設定」→「画面表示と明るさ」→「自動ロック」を「なし」にする
- Safari の共有ボタン →「ホーム画面に追加」でアプリのように全画面で使える

## 譲渡（引き継ぎ）手順
1. **GitHub**: リポジトリの Settings → 一番下「Transfer ownership」→ 新しいオーナーのユーザー名を入力
   - 移管後の公開URLは `https://新ユーザー名.github.io/table-transfer-kds/` に変わります（各 iPad で開き直しが必要）
   - 新オーナー側で Settings → Pages が有効になっているか確認
2. **Firebase**: Firebase コンソール → 歯車 →「ユーザーと権限」→ 新しい管理者を「オーナー」で追加
   → 新オーナーが承諾後、旧オーナーは自分を削除
