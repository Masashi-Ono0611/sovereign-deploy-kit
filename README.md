# Sovereign Deploy Kit

> 静的サイトを、政府やCloudflareでも止められないウェブに1コマンドで公開するCLIツール。

```bash
npx ton-sovereign-deploy ./build/
```

```
📦 Uploading 47 files...
  ✓ index.html
  ✓ assets/main.js (1.2 MB)
  ✓ assets/style.css
  ... 44 more files

✅ TON Storage:  ton://bag-a3f9c82e1b4d...
🔗 Fallback URL: https://ton.run/bag-a3f9c82e1b4d

Your site cannot be taken down. No server. No CDN. No domain registrar.
```

---

## なぜ必要か

DeFi プロトコルのフロントエンドが繰り返し「強制オフライン」にされている:

- **Tornado Cash** → 米OFAC制裁でフロントエンドが完全削除
- **Uniswap** → 特定トークンへのフロントエンドアクセスを制限
- **1inch, Balancer など** → ジオブロック、ドメイン停止

これらは全て同じ構造: **スマートコントラクトは生きているが、Webサイトが死んでいる**。原因は単純で、普通のサーバーとドメインを使っているから。

TON ブロックチェーンにはこれを解決するインフラが既に存在する。ただし、使うには専門知識と複雑な設定が必要だった。このツールはそれをゼロ設定にする。

---

## 仕組み

### TON Storage (分散ファイルストレージ)

- ファイルをブロックチェーンネットワーク上に分散保存
- コンテンツアドレス (Bag ID) で識別 — 内容が変わらない限りURLも変わらない
- サーバーなし、削除不可、永続

### TON DNS (.ton ドメイン)

- `myprotocol.ton` のような人間可読ドメインをブロックチェーン上に登録
- 差し押さえ不可、更新も本人の署名のみ
- TON Proxy 経由でアクセス可能 (v0.2)

### データフロー

```
npx ton-sovereign-deploy ./build/
         │
         ├─→ ./build/ を検証 (dist/ | build/ | out/ | public/ を自動検出)
         │
         ├─→ ~/.ton-sovereign/bin/storage-daemon を確認
         │     なければ TON 公式リリースから自動DL (初回のみ、約30秒)
         │
         ├─→ storage-daemon 経由で TON ネットワークに分散送信
         │     BitTorrent的なチャンキング + Merkle木でハッシュ化
         │
         └─→ Bag ID を取得 → 結果を表示
```

---

## ロードマップ

### v0.1 — TON Storage アップロード (Day 1-5)

```bash
npx ton-sovereign-deploy ./build/
# → bag ID + ton:// URL + ton.run fallback URL
```

- ウォレット不要
- セットアップ不要 (`storage-daemon` は自動DL)
- Vite / Next.js export / CRA のビルド出力を自動検出

### v0.2 — .ton DNS 登録 (Day 6-10)

```bash
npx ton-sovereign-deploy ./build/ --domain myprotocol.ton
# → TON Connect でウォレット署名
# → myprotocol.ton でアクセス可能に
```

### v0.3 — 仕上げ (Day 11-14)

- ton.run 経由での疎通確認
- GitHub Action サポート
- `--watch` モード (ファイル変更時に再デプロイ)

---

## 競合との比較

| ツール | 分散? | 1コマンド? | .ton DNS? | fallback URL? |
|--------|-------|-----------|-----------|--------------|
| Vercel / Netlify | No (中央集権) | Yes | No | — |
| IPFS / Fleek | Yes | Yes | No (.eth のみ) | Yes |
| TON CLI (手動) | Yes | No | 手動設定 | No |
| **Sovereign Deploy Kit** | **Yes** | **Yes** | **Yes (v0.2)** | **Yes** |

直接の競合: ゼロ。

---

## ターゲットユーザー

1. **DeFiプロトコル開発者** — フロントエンドのテイクダウンリスクを排除したい
2. **TONエコシステム開発者** — .ton サイトを簡単に立ち上げたい
3. **検閲リスクのあるアプリ全般** — ジャーナリズム、プライバシーツール、DAO フロントエンド

---

## 開発状況

**ステータス:** v0.3 実装中 (2026-03-28 現在)
- v0.1 ✅ — TON Storage アップロード
- v0.2 ✅ — .ton DNS 登録
- v0.3 🚧 — 仕上げ (GitHub Actions, Windows, 疎通確認, watch モード)

**最初の公開ターゲット:** Gateway 2026 (2026年5月)

詳細な実装計画: [PLAN.md](./PLAN.md)

---

## CI/CD 連携 (v0.3)

### GitHub Actions で自動デプロイ

`git push` するだけで TON Storage にデプロイできます。

**セットアップ:**

```bash
# 1. テンプレートをコピー
mkdir -p .github/workflows
cp node_modules/ton-sovereign-deploy/templates/github-workflow.yml \
   .github/workflows/deploy.yml

# 2. Git に追加
git add .github/workflows/deploy.yml
git commit -m "Add TON Storage deployment"

# 3. Push すると自動デプロイ
git push origin main
```

**ワークフローの機能:**

- `main` ブランチへの push で自動デプロイ
- `--ci-mode` でスピナー無効化（ログが見やすい）
- `--json-output` で bag ID を後続ステップで参照可能
- プルリクエストにプレビュー bag ID を自動コメント

**出力例:**

```
🚀 Deployed to TON Storage
Bag ID: a3f9c82e1b4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1
ton://a3f9c82e...
https://ton.run/a3f9c82e...
```

---

## CLI オプション

### 基本

```bash
ton-sovereign-deploy [build-dir] [options]
```

| オプション | 説明 |
|-----------|------|
| `[build-dir]` | ビルドディレクトリ (省略時は自動検出) |
| `--testnet` | TON テストネットを使用 |
| `--desc <text>` | Bag の説明 |
| `--domain <domain>` | .ton ドメインに登録 (v0.2) |
| `--ci-mode` | CI 環境向けスピナー無効化 (v0.3) |
| `--json-output` | JSON 出力 (v0.3) |

### CI/CD 向けオプション

```bash
# JSON 出力 (スクリプトで解析しやすい)
ton-sovereign-deploy ./build/ --json-output
# → {"bagId":"...","tonUrl":"ton://...","fallbackUrl":"https://..."}

# CI モード (GitHub Actions 等でログが見やすい)
ton-sovereign-deploy ./build/ --ci-mode --json-output
```
---

## 動作環境

### 対応 OS

- **macOS** — 10.15+ (Catalina 以上)
- **Linux** — x86_64, ARM64
- **Windows** — 10/11 (x64, ARM64) v0.3+

### システム要求

- **Node.js** 18+
- **PowerShell** 3.0+ (Windows のみ、標準搭載)
- **ネットワーク** — TON ノードとの通信に必要

### Windows 固有の注意事項

**初回実行時:**
- PowerShell が `storage-daemon-win-x86-64.exe` のダウンロードを実行
- Windows Defender または他の Antivirus ソフトが警告を表示する可能性があります
  - その場合: 「許可」または「除外」を選択してください
  - ファイルは公式 TON GitHub リリースから取得されます

**WSL (Windows Subsystem for Linux):**
- WSL 環境では Linux バイナリが使用されます
- WSL2 推奨（より良いネットワークパフォーマンス）

**パスの長さ:**
- Windows はデフォルトで 260 文字のパス制限があります
- `~\.ton-sovereign\` は短いため、通常問題にはなりません
- プロジェクトのパスが長い場合は、長いパスを有効化してください
