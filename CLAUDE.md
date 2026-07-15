# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

portal-cmsは「フロアガイド」製品群（Gido / Gido-Touch / Gido-Touch-Mini / Grain-Link / Bridge-Ground）の**機器登録・監視・管理コンソール**。**このサービスに直接登録・ヘルス報告してくるのはBridge-Groundのみ**——各STBにフロアガイドアプリとセットでインストールされたBridge-Groundが、自分自身とその同一STB上のフロアガイドアプリ両方の分をまとめて代理登録・報告する（フロアガイドアプリ ⇄ Bridge-Ground ⇄ portal-cms）。管理者はここでプロジェクト（施設・フロア）、機器、ユーザー権限、APIトークンを管理する。

React19 + TypeScript + Vite（SPA）、Firebase（Firestore + Cloud Functions + Authentication）構成。Firebaseプロジェクト: `portal-cms-emk`（`.firebaserc`）。

## Repository layout

- `src/pages/` — 画面（Home/Projects/デバイス詳細/PendingDevices/ユーザー管理/APIトークン/DeletionRequests/Logs/Settings/Profile等）
- `src/components/` — 共有UIコンポーネント
- `src/layouts/` — 画面レイアウト
- `src/contexts/` — React Context（認証状態等）
- `src/hooks/` — カスタムフック
- `src/lib/` — Firebase初期化・API呼び出しラッパー等
- `src/i18n/` — i18next設定（多言語対応）
- `src/types/` — 型定義
- `functions/src/index.ts` — Cloud Functions（`register`・`status`の2エンドポイントのみ。呼び出し元はBridge-Groundのみ——自分自身の分と、同一STB上のフロアガイドアプリの分を代理で送ってくる）
- `firestore.rules` — Firestoreセキュリティルール
- `firebase.json` / `.firebaserc` — Firebaseプロジェクト設定（`portal-cms-emk`、単一プロジェクト構成）。Hosting設定は含まれていない — フロントエンド（React SPA）は**Cloudflare Pages**でホスティングされており、GitHub連携によるビルド・デプロイはCloudflare側のダッシュボードのみで完結する（リポジトリ内に対応する設定ファイルは無い）

## Development commands

Docker不使用。ローカルNode環境で直接実行する。

```bash
npm run dev       # Vite開発サーバー
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # ビルド後のプレビュー
```

Cloud Functions（`functions/`配下、別package.json）:
```bash
cd functions
npm run build     # tsc
npm run deploy    # build && firebase deploy --only functions
```

Firebase Emulatorの利用有無は未確認 — ローカルでFirestore/Functionsを動かす場合は事前にユーザーに確認する。

## Known gotchas

- **Cloud Functionsは`register`・`status`の2つのみ**（`functions/src/index.ts`、`onRequest`ベース）。他の管理系操作（プロジェクト/デバイス/ユーザー管理等）はクライアントのFirebase SDKから直接Firestoreを操作している（Cloud Functions経由ではない）。新しい管理系APIを追加する際は、既存がどちらのパターンかを都度確認する。
- **APIトークンはSHA-256でハッシュ化して`apiTokens`/`tokenLookup`に保存**。平文トークンはクライアントに一度だけ表示され、DBには残らない設計と思われる — トークン関連の変更をする際は再表示不可能な前提を崩さないこと。
- **Realtime Database（`/signals/{deviceId}`）はFirestoreと別**で、デバイスへのログ/設定/スクリーンショット取得要求のトリガーに使われている。Firestoreだけを見ていると見落とす。
- **フロントエンドのホスティングはFirebase Hostingではなく、Cloudflare Pages**（`firebase.json`にHosting設定が無いのはこのため）。ビルド・デプロイはCloudflare Pagesダッシュボード側のGitHub連携で完結し、リポジトリ内には設定ファイルが存在しない。
- **サービスアカウントのOAuth2アクセストークンでFirestore REST APIにアクセスすると、セキュリティルールはバイパスされる**（#211で実測確認）。2026-06-11の`893609f`（revertコミット）には逆の内容（「SAトークンもルールの対象のままでバイパスされない」）が記載されているが、これは#211実装後の実測（エラー無し、フラグの残留も再発しない）と矛盾しており、当時の診断が誤っていた可能性が高い。今後この領域を触る場合は、コミット履歴の記述より実際の動作（Cloudflareダッシュボードのログで`exceptions`/`logs`を確認する等）を優先して判断すること。
- **`devices/{deviceId}`の`allow update`ルールは、`isAdmin()`を満たさない場合`hasOnly([...])`で許可フィールドを限定している**。Workerが新しいフィールドをこのドキュメントに書き込む場合（例: 過去に`appVersion`追加時に発生）、このホワイトリストに追加するか、Worker側がサービスアカウント認証でルールをバイパスできる状態になっているかを確認すること。特に`settingsRequested`/`screenshotRequested`のクリア書き込みはこのホワイトリストに含まれていない（サービスアカウント認証でバイパスされる前提）。

## Branches & deploy flow

- 作業は `dev` を起点に `hotfix/<内容>` または `feature/<内容>` ブランチを作成して行う（git worktreeで作業ディレクトリを分けるのが基本、`C:\dev\floor-guide-Issue\#000.md`参照）
- 過去は`dev`に直接作業・pushする運用だったが、複数リポジトリ・複数タスクの並行作業に対応するため上記のブランチ運用に移行した
- **フロントエンド（Cloudflare Pages）のデプロイフロー**:
  1. `hotfix/<内容>` へコミット・push
  2. Cloudflare Pagesが自動でプレビュー環境をビルドし、Deployment ID・Deployment URLを生成する（push都度、ダッシュボード側で完結）
  3. プレビューURLで完了条件を確認できたら、`dev`へPR・マージ
  4. **`dev`のマージが完了したら、`dev`から`master`（本番ブランチ）へ必ずPRを作成してマージする**（直接pushではなくPR経由。`gh pr create --base master --head dev` → `gh pr merge`）。これは省略可能な任意ステップではなく、リリースのたびに毎回必要な手順。
  5. `master`へのマージがトリガーとなり、Cloudflare Pagesが本番環境へ自動デプロイする
- `dev`に複数のIssue/PRがまとまって溜まっている場合、`master`へのPRは差分（Compare）に応じてまとめて1回で行ってよい（`dev`→`master`のPRは基本的に「今`dev`にある中で`master`にまだ反映されていない差分をそのまま持っていく」もので、個々のIssue単位で分割する必要はない）。
- **Worker（`workers/`）・Firestoreルール（`firestore.rules`）のデプロイは上記と異なり手動**: `npx wrangler deploy` / `firebase deploy --only firestore:rules`（後述）。Cloudflare Pagesの自動デプロイパイプラインとは別物なので、変更内容に応じてどちらの手順が必要か都度判断する。
- Cloud Functionsのデプロイは`functions/`で`npm run deploy`（`firebase deploy --only functions`）。
- **Worker・Firestoreルールを両方変更する場合は、必ずWorker→Firestoreルールの順でデプロイする**（Workerの認証方式変更前にルールを締めると、Worker自身の正規アクセスがブロックされる。#211で実際に発生しかけた事例）。

## Architecture

```
フロアガイドアプリ（Gido/Gido-Touch/Gido-Touch-Mini/Grain-Linkのいずれか、STB上）
        │ ローカルAPI（同一コンピュータ内）で自己登録・ヘルス報告
        ▼
   Bridge-Ground（同一STB上、フロアガイドアプリとセットでインストール）
        │ 自分自身の分 + フロアガイドアプリの分を代理でまとめて送信
        │ POST /register（登録）、POST /status（ヘルス報告）+ Bearer token
        ▼
   Cloud Functions（register / status、asia-northeast1）
        │
        ▼
   Firestore
   ├─ projects/        施設・フロア
   ├─ devices/         登録済み機器（各アプリ・Bridge-Ground）
   ├─ pendingDevices/   登録承認待ち
   ├─ groups/          プロジェクト内の機器グルーピング
   ├─ apiTokens/        registration/device種別のトークン（SHA-256ハッシュ保存）
   ├─ userRoles/        owner/admin/userロール
   ├─ deletionRequests/ 削除申請の承認ワークフロー
   └─ siteLogs/         管理操作の監査ログ
        │
        ▼
   Realtime Database: /signals/{deviceId}（ログ/設定/スクリーンショット取得要求のリアルタイム通知）
        ▲
        │
   管理者（React SPA、Firebase Authentication）
```

- 対象アプリのホワイトリスト: `Gido` / `Gido-Touch` / `Gido-Touch-Mini` / `Grain-Link` / `Bridge-Ground`（Cloud Functions内にハードコードされている）。新しいアプリを追加する場合はこのホワイトリストの更新が必要。

## Code conventions

- ESLint（flat config、React hooks/refresh plugin）に従う。`npm run lint`で確認。
- コミットメッセージは変更内容が明確に伝わるものにする。複数ファイルの変更を1コミットにまとめても構わない。

## Project context

portal-cmsは「フロアガイド」製品群（Gido/Gido-Touch/Gido-Touch-Mini/Grain-Link/Bridge-Ground）の管理コンソールで、各STBのBridge-Ground経由で（フロアガイドアプリの分も代理で）全機器の登録・ヘルス報告を受け取る中心的な存在。`s-yoshida-33`配下でホストされている姉妹プロジェクト群の1つ。ワークフロー運用ルールは`C:\dev\floor-guide-Issue\#000.md`を参照（wonder-screen-frontendプロジェクトで確立した手法を踏襲）。
