# デモのセキュリティ方針

Next.js demo: mock is the default. Real mode sends only the selected input to one of the four official APIs through server-side adapters. Secrets remain server-side.

## エージェントの許可と拒否

`.codex/config.toml` は通常の作業を workspace-write サンドボックスに限定し、コマンドのネットワークアクセスと追加の一時ディレクトリ書き込みを無効にします。サンドボックスを超える要求は on-request / user で人が承認する設定です。シェルへの環境変数継承を core に制限し、代表的なキー名を除外します。API の動作確認でキーが必要な場合は、ユーザーが許可した対象プロセスに限定して扱ってください。

接続アプリは初期無効です。必要になったアプリだけを ID ごとに明示的に有効化し、個別ツールの範囲と承認設定をレビューします。この設定は汎用 MCP やブラウザを一括無効にするものではありません。

`.codex/rules/project.rules` は削除・権限昇格・Git の reset/clean/restore を拒否し、依存操作、公開、外部通信、シェルやインタープリターのサンドボックス外実行を承認対象にします。通常のプロジェクト内編集と検証はサンドボックス内で進められます。

確認用コマンド（対象コマンドは実行せず、判定だけを返します）：

```sh
codex execpolicy check --rules .codex/rules/project.rules -- rm -rf public
codex execpolicy check --rules .codex/rules/project.rules -- pnpm add react
```

プロジェクトを信頼済みにした新しい Codex セッションで設定と rules を読み込んでください。現在のチャットの権限は、このファイルを追加するだけでは切り替わりません。開始時に workspace-write・ネットワーク無効・承認者 user が有効か確認してください。管理者の制約や明示的なセッション設定はプロジェクト設定より優先されます。

prefix rules は全操作を封じる仕組みではありません。引数の順序や絶対パス、インタープリター内の操作など、列挙したプレフィックスに一致しない要求は残ります。また workspace-write はプロジェクト外の読み取りや、プロジェクト内のすべての削除を禁止するものではありません。AGENTS.md の範囲制限は行動ルールであり OS の強制制限ではありません。

エージェントによる設定緩和まで強制的に防ぐ場合は、管理者がプロジェクト外の requirements.toml / 管理ポリシーで制約を固定し、必要なら読み取り範囲も隔離した環境を用意します。今回はプロジェクト内の設定だけを追加しています。

公式仕様：[設定リファレンス](https://developers.openai.com/codex/config-reference)、[コマンドルール](https://developers.openai.com/codex/rules)。

## 依存関係

pnpm-workspace.yaml でインストール時スクリプトを停止し、公開後7日未満の依存を避け、完全なバージョンで保存します。.npmrc は公式 npm レジストリと TLS 検証を指定します。

pnpm 10.33.2 と Node.js 24.14.1 を指定し、直接依存を完全なバージョンで固定して pnpm-lock.yaml を作成しています。再現インストールは `pnpm install --frozen-lockfile --ignore-scripts`。`pnpm audit --audit-level=moderate` を実行し、2026-10-12 の確認では既知の脆弱性は検出0件でした。CI と Dependabot にアプリ依存の確認も追加しています。CI の pnpm 自体の導入も固定版・スクリプト停止で行います。

## ファイルと秘密情報

`python3 scripts/security_check.py` は Git 管理対象と未追跡の非 ignore ファイルをチェックします。秘密鍵、代表的なトークン、実行形式、アーカイブ、未承認のバイナリ、曖昧な依存バージョンを検出した場合は失敗します。マッチした秘密値は出力しません。ignore 済みのローカル .env は対象外ですが、追跡された .env は検出します。

動画などのバイナリ素材は `public/samples/` 内の自作サンプルに限定します。チェックはウイルス対策ソフトではなく、許可した動画や画像の無害性を保証しません。外部から取得した検体や不明な素材は保存・実行せず、素材の出所と内容をレビューしてください。

GitHub Actions は秘密情報を渡さず、読み取り権限でチェックします。アクションはコミット SHA に固定し、Dependabot が更新候補を通知します。GitHub に配置後、Security hygiene をブランチ保護の必須チェックに設定し、利用可能なら secret scanning / push protection を有効にしてください。これらのリモート設定はローカルファイルだけでは強制できません。

## アプリ実装で適用すること

Mock requests retain the 32 KiB limit and fixture validation. Real requests use a separate route with same-origin and JSON checks, a 5,650,000-byte body limit and a 5-second receive deadline. Profiles are bounded and whitelisted; threads must match bundled fixtures. Video input permits one JPEG per request, at most 4 MiB and 1280px per side, with at most 30 sampled frames. The server permits at most four relevance requests and two video requests concurrently per process. Provider calls time out after 30 seconds (including response reading); responses are limited to 256 KiB. Browser deadlines are 15 seconds for mock and 40 seconds for real. Inputs, frames and keys are never logged or persisted by this app. Provider retention policies apply to transmitted inputs.


本番のHTMLはリクエストごとの nonce を使う CSP を適用し、外部へのブラウザ通信・埋め込み・プラグインを拒否します。開発モードだけは Next.js のため unsafe-eval とローカル WebSocket を許可します。スタイルのインライン適用は許可しています。nosniff・Referrer-Policy・Permissions-Policy も設定し、API応答は no-store です。サーバーは127.0.0.1だけにバインドします。

Outbound endpoints are fixed to api.typesafe.ai, api.openai.com, api.liquid.ai and api.cloudflare.com. Cloudflare account IDs must be 32 hexadecimal characters. Redirects are rejected; TLS verification stays enabled. No input can select a URL. Model settings are validated. Only model IDs and availability flags are returned by the config route. Errors expose generic status information, never raw provider bodies. Switching modes or inputs aborts in-flight requests and separates caches. There are no automatic retries or fallback to mock.


設定と静的チェックだけでサプライチェーン攻撃やインシデントを完全に排除することはできません。依存導入・アプリ実装時にも確認を続けます。
