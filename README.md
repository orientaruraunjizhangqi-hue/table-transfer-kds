# 卓移動 KDS（全端末リアルタイム同期版）

卓移動の指示（移動元 → 移動先・性別・メモ）を発行し、全端末でリアルタイムに共有する店舗用システムです。

- 公開URL: https://orientaruraunjizhangqi-hue.github.io/table-transfer-kds/
- 画面: GitHub Pages（無料）
- データ同期: Firebase Firestore（無料 Spark プラン）

## ファイル構成
| ファイル | 内容 |
|---|---|
| `index.html` | アプリ本体（これ1つで動作） |
| `firestore.rules` | Firestore のセキュリティルール（Firebase コンソールに貼り付けて使用） |
| `.nojekyll` | GitHub Pages 用の設定ファイル（削除しないでください） |

## 修正のしかた
GitHub 上で `index.html` を開き、鉛筆アイコン（Edit）で編集 →「Commit changes」。
1〜2分で公開URLに自動反映されます。

## Firebase の設定
`index.html` 内の `firebaseConfig`（`▼▼▼` 〜 `▲▲▲` の部分）に Firebase プロジェクトの設定値が入っています。
Firebase プロジェクトを変更する場合はここを書き換えます。

### Firestore のデータ
| パス | 内容 |
|---|---|
| `kds_orders/{自動ID}` | 移動オーダー（gender, fromTable, toTable, status, createdAt, completedAt, noteType, textNote, canvasData, no） |
| `kds_settings/tables` | `{ tables: [{ name, colorId }] }` 卓設定・色分け |

## 画面の見方
- ヘッダーの表示: 緑「同期中」/ 黄「オフライン」/ 赤「同期エラー」or「Firebase未設定」
- 一時的に電波が切れても操作でき、復帰時に自動で送信されます
- 通知音 ON/OFF・デモ移動は端末ごとの設定（デモ移動で作られたオーダーは全端末に共有されます）

## 譲渡（引き継ぎ）手順
1. **GitHub**: リポジトリの Settings → 一番下「Transfer ownership」→ 新しいオーナーのユーザー名を入力
   - 移管後の公開URLは `https://新ユーザー名.github.io/table-transfer-kds/` に変わります
   - 新オーナー側で Settings → Pages が有効になっているか確認
2. **Firebase**: Firebase コンソール → プロジェクトの設定 →「ユーザーと権限」→ 新しい管理者を「オーナー」で追加
   → 新オーナーが承諾後、旧オーナーは自分を削除
