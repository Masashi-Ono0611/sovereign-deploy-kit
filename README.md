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

✅ TON Storage (ADNL):  ton://bag-a3f9c82e1b4d...
📦 Bag ID: a3f9c82e1b4d...

Your site is now on the decentralized web:
• Content is immutable and censorship-resistant
• Accessible via ADNL protocol (ton:// URLs)
• Will propagate through TON network over minutes-hours

Note: ton.run fallback URLs may return 404 until bag propagates.
Use watch mode (--watch) to keep your daemon running and help propagation.
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

**アーキテクチャ:**
- Bag は ADNL プロトコルでアクセス可能（ton:// URL）
- ネットワークへの伝播には数分〜数時間かかります
- ton.run などのパブリックゲートウェイは、伝播完了した bag のみアクセス可能
- セルフホスティング（デフォルト）では、あなたの PC がオフラインだとアクセス不能

**実用的なホスティング:**
- 24時間アクセス可能にするには、ストレージプロバイダー契約が必要
- ストレージプロバイダーは bag をホストし対価を受け取ります
- v0.4 以降でプロバイダー統合を予定しています

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

### v0.1 — TON Storage アップロード (Day 1-5) ✅

```bash
npx ton-sovereign-deploy ./build/
# → bag ID + ton:// URL（ADNL アクセス）
```

- ✅ セルフホスティングならウォレット不要
- ✅ セットアップ不要 (`storage-daemon` は自動DL）
- ✅ Vite / Next.js export / CRA のビルド出力を自動検出
- ✅ macOS/Linux/Windows 対応

**現在の制限:**
- ⚠️ ton.run などのパブリックゲートウェイは 404 を返す可能性があります（bag が伝播するまで）
- ⚠️ セルフホスティングでは PC オフライン時にアクセス不能
- ⚠️ 24時間ホストにはストレージプロバイダー契約が必要（有料）

### v0.2 — .ton DNS 登録 (Day 6-10) ✅

```bash
npx ton-sovereign-deploy ./build/ --domain myprotocol.ton
# → TON Connect でウォレット署名
# → myprotocol.ton でアクセス可能に
```

- ✅ TON Connect ディープリンク生成
- ✅ QR コード表示（ターミナル内）
- ✅ DNS レコードオンチェーン確認（ポーリング）
- ✅ TONAPI 経由のドメイン所有権確認

### v0.3 — 仕上げ ✅ 完了

```bash
npx ton-sovereign-deploy ./build/
# → bag ID + ton:// URL（ADNL アクセス）
# → bag ID + ton:// URL + 伝播確認
# → GitHub Actions + Windows サポート + watch モード
```

- ✅ TONAPI.io 経由で bag のステータス確認（verifyBagOnNetwork）
- ✅ GitHub Action サポート（`--ci-mode`, `--json-output`）
- ✅ Windows サポート（win32-x64, win32-arm64, win32-ia32）
- ✅ `--watch` モード（ファイル変更時に自動再デプロイ、daemon を動かし続けて伝播を促進）

**注意:** verify は 60 秒でタイムアウトしますが、実際の伝播には数時間かかる場合があります。

---

## 競合との比較

| ツール | 分散? | 1コマンド? | .ton DNS? | CI/CD? | Windows? |
|--------|-------|-----------|-----------|---------|---------|
| Vercel / Netlify | No (中央集権) | Yes | No | Yes | Yes |
| IPFS / Fleek | Yes | Yes | No (.eth のみ) | Yes | Yes |
| TON CLI (手動) | Yes | No | 手動設定 | No | No |
| **Sovereign Deploy Kit** | **Yes** | **Yes** | **Yes (v0.2)** | **Yes (v0.3)** | **Yes (v0.3)** |

直接の競合: ゼロ。

---

## ターゲットユーザー

1. **DeFiプロトコル開発者** — フロントエンドのテイクダウンリスクを排除したい
2. **TONエコシステム開発者** — .ton サイトを簡単に立ち上げたい
3. **検閲リスクのあるアプリ全般** — ジャーナリズム、プライバシーツール、DAO フロントエンド

---

## 開発状況

**ステータス:** v0.3 完成 (2026-03-28)
- v0.1 ✅ — TON Storage アップロード
- v0.2 ✅ — .ton DNS 登録
- v0.3 ✅ — 仕上げ（疎通確認、GitHub Actions、Windows、watch モード）

**今後の改善（v0.4+）:**
- ストレージプロバイダー統合（24時間ホストを実現）
- パブリックゲートウェイ連携（ton.run 以外の選択肢）
- 伝播モニタリング機能（リアルタイムで伝播状況を可視化）

**リリース:** https://github.com/Masashi-Ono0611/sovereign-deploy-kit

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
Bag may take minutes-hours to propagate through network
```

**注意:** CI 環境では verify が失敗しても正常です。bag は作成されていますが、ネットワークへの伝播には時間がかかります。watch モードは CI では使用できません。

---

## ton:// URL の使い方

### ton:// URL とは

ton:// URL は TON の ADNL プロトコルを使用したコンテンツアドレスです。一度作成された bag は変更不可で、ネットワーク上に永続的に存在します。

### アクセス方法

**1. Ton HTTP Proxy 経由（推奨）**

ローカルで Ton HTTP Proxy を実行し、ブラウザからアクセスします：

```bash
# Ton HTTP Proxy をインストール
npm install -g @ton-community/http-proxy

# プロキシを起動
ton-http-proxy

# ブラウザでアクセス
open http://localhost:8080/ton://bag-a3f9c82e1b4d...
```

**2. storage-daemon が実行中の場合**

このツールの watch モードを使用している場合、bag はあなたの PC から直接アクセス可能です：

```bash
# ターミナル1: watch モードでデプロイ
npx ton-sovereign-deploy ./build/ --watch

# ターミナル2: bag にアクセス
# daemon が ADNL ポートでリクエストを受け付け
```

**3. 伝播後のパブリックアクセス**

bag がネットワークに伝播した後（数分〜数時間）、以下の方法でアクセス可能になる場合があります：

- ton.run（bag が "active" と認識された場合のみ）
- その他の TON Storage プロバイダー

ただし、これらは保証されません。24時間アクセス可能にするには、ストレージプロバイダー契約が必要です。

### watch モードで伝播を促進

```bash
# ファイル変更を監視し、daemon を動かし続ける
npx ton-sovereign-deploy ./build/ --watch

# daemon が実行中のため、ネットワークは bag を発見しやすくなります
# Ctrl+C で停止するまで、あなたの PC が bag のシードとなります
```

### 伝播時間の目安

- **最速:** 数分（既存の活発なノードがある場合）
- **通常:** 30分〜2時間
- **最悪:** 数時間（ネットワークの状態による）

verify コマンドで 60 秒待機してチェックしますが、これは "minimum viable verification" です。実際にはさらに時間がかかる場合があります。

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
| `--watch` | ファイル変更を監視して自動再デプロイ (v0.3) |
| `--debounce <ms>` | watch モードのデバウンス遅延（デフォルト: 2000ms） |
| `--skip-verify` | bag アクセス確認をスキップ（伝播には時間がかかるため） |

### CI/CD 向けオプション

```bash
# JSON 出力 (スクリプトで解析しやすい)
ton-sovereign-deploy ./build/ --json-output
# → {"bagId":"...","tonUrl":"ton://...","fallbackUrl":"https://..."}

# CI モード (GitHub Actions 等でログが見やすい)
ton-sovereign-deploy ./build/ --ci-mode --json-output
```

### 開発モード (Watch)

```bash
# ファイル変更を監視して自動再デプロイ
ton-sovereign-deploy ./build/ --watch

# デバウンス3秒（大規模プロジェクト向け）
ton-sovereign-deploy ./build/ --watch --debounce 3000
```

**watch モードの動作:**
- ファイル変更を検知すると自動的に再デプロイ
- 連続する変更を1回のデプロイに集約（デバウンス）
- daemon を動かし続け、ネットワークへの伝播を促進
- Ctrl+C で停止

**watch モードの推奨用途:**
```bash
# ターミナル1で watch モード起動
ton-sovereign-deploy ./dist/ --watch

# 別ターミナルでビルド
npm run build

# 自動的に dist/ の変更を検知して再デプロイ
# daemon が実行中のため、ton:// URL でアクセス可能
```

**注意:** watch モードでは daemon が実行され続けるため、PC をシャットダウンすると bag にアクセスできなくなります。

---
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
