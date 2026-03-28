# Sovereign Deploy Kit — Engineering Plan

**Date:** 2026-03-28
**Design doc:** `~/.gstack/projects/ton-atlas/2026-03-28-design-sovereign-deploy-kit.md`
**Review:** /plan-eng-review

---

## Architecture (post-review)

Design doc の前提を検証した結果、v0.1 の核心前提が変わった。

### 変更点: TONAPI.io → storage-daemon auto-download

**元の前提 (設計書):** TONAPI.io REST API でTON Storageアップロード (no wallet, no node)
**現実:** TONAPI.io には Storage upload エンドポイントが存在しない (`getStorageProviders` のみ)
**採用策:** storage-daemon バイナリを初回実行時に自動ダウンロードし、CLIがライフサイクル管理 (Playwright パターン)

### データフロー

```
User: npx ton-sovereign-deploy ./build/
         │
         ▼
    CLI (cli.ts)
         │
         ├─→ detect.ts: ./build/ を検証
         │   detect: dist/ | build/ | out/ | public/ を優先順でチェック
         │
         ├─→ daemon.ts: storage-daemon を準備
         │   check: ~/.ton-sovereign/bin/storage-daemon 存在確認
         │   if missing: download from github.com/ton-blockchain/ton releases
         │     platform: darwin-arm64 | darwin-x86_64 | linux-x86_64 | linux-arm64
         │   start: child_process.spawn(storage-daemon, [flags, tmpConfigDir])
         │   wait: daemon ready (poll console port)
         │
         ├─→ upload.ts: bag 作成
         │   spawn: storage-daemon-cli --cmd "create <path> --desc <name>"
         │   parse: bag ID from stdout
         │
         ├─→ daemon.ts: daemon 停止・クリーンアップ
         │
         └─→ output.ts: 結果を表示
             ┌─────────────────────────────────────────┐
             │ ✅ TON Storage: ton://bag-abc123def456  │
             │ 🔗 Fallback:    https://ton.run/bag-abc │
             │                                         │
             │ Your site cannot be taken down.         │
             └─────────────────────────────────────────┘
```

### Binary 管理方針

- 保存先: `~/.ton-sovereign/bin/storage-daemon` + `storage-daemon-cli`
- 一度DLしたら全プロジェクトで共有
- バージョンファイル: `~/.ton-sovereign/bin/.version` でバイナリバージョン管理
- CI/CD 環境では `~/.ton-sovereign/` をキャッシュ対象に設定可能

### v0.2 (TON DNS) への拡張性

今は未設計。v0.1 の出力型は拡張できるように設計する:

```typescript
interface DeployResult {
  bagId: string
  tonUrl: string         // ton://bag-xxx
  fallbackUrl: string    // https://ton.run/bag-xxx
  dns?: {                // v0.2 で追加
    domain: string
    txHash: string
  }
}
```

---

## Tech Stack

| 用途 | 選択 | 理由 |
|------|------|------|
| 言語 | TypeScript | npm/npx エコシステム、型安全 |
| ビルド | `tsup` | esbuild ベース、ESM+CJS デュアル出力 |
| CLI フレームワーク | `commander` | 実績多数、型サポート良好 |
| 進捗表示 | `ora` + `chalk` | spinner + 色付き出力 |
| テスト | `vitest` | TypeScript ネイティブ、高速 |
| TON SDK | `@ton/ton` | v0.1 では未使用、v0.2 の DNS で使用 |

**v0.1 で `@ton/ton` は不要**。storage-daemon を子プロセスとして管理するだけなので。v0.2 の設計が決まったタイミングで追加する。

---

## プロジェクト構造

```
sovereign-deploy-kit/
├── src/
│   ├── cli.ts          # commander.js エントリポイント
│   ├── daemon.ts       # バイナリDL + プロセス管理
│   ├── upload.ts       # storage-daemon-cli 経由でbag作成
│   ├── detect.ts       # ビルドディレクトリ自動検出
│   └── output.ts       # 出力フォーマット + 結果型定義
├── test/
│   ├── detect.test.ts  # ユニットテスト
│   ├── daemon.test.ts  # バイナリ管理のテスト (モック)
│   └── upload.test.ts  # E2Eテスト (daemon起動を含む)
├── bin/
│   └── ton-sovereign-deploy  # package.json の bin フィールドが指すエントリ
├── package.json
├── tsconfig.json
└── README.md
```

ファイル数: 7 src + 3 test + config = 合計10ファイル。閾値(8ファイル)を僅かに超えるが、CLIツールとして妥当な最小構成。

---

## Code Quality ポイント

### 1. プロセス管理の堅牢性

`storage-daemon` は重いプロセス。以下のケースを必ず処理する:

```typescript
// daemon.ts が責任を持つクリーンアップ
process.on('SIGINT', () => daemon.kill())
process.on('SIGTERM', () => daemon.kill())
process.on('exit', () => daemon.kill())
process.on('uncaughtException', (e) => { daemon.kill(); throw e })
```

デーモンが起動したまま CLI が死ぬと、次回実行でポートが衝突する。`tmpdir` を使ってセッションごとに分離するか、既存デーモンを再利用する判断ロジックが必要。

**推奨**: セッションごとに `~/.ton-sovereign/sessions/<pid>/` を作成し、終了時に削除。

### 2. ダウンロード中のエラー処理

バイナリDL中に Ctrl+C されたら不完全なバイナリが残る。

```typescript
// NG: 不完全ファイルが残る
await downloadFile(url, binPath)

// OK: 一時パスに書いてから rename
const tmpPath = `${binPath}.tmp`
await downloadFile(url, tmpPath)
await chmod(tmpPath, 0o755)
await rename(tmpPath, binPath)
```

### 3. ビルドディレクトリ検出の優先順位

```typescript
// detect.ts
const BUILD_DIRS = ['dist', 'build', '.next/out', 'out', 'public']

export function detectBuildDir(cwd: string): string | null {
  // 引数として渡された場合はそのまま使う
  // フォールバック: 上記リストを順番にチェック
  // 見つからない場合は null (CLI がエラーメッセージを出す)
}
```

Next.js の `output: 'export'` は `.next/out/` に出力するので明示的に含める。

### 4. DRY ルール

`ton:// URL` と `ton.run` URL の構築は2箇所で使われる可能性があるので、`output.ts` で一元管理:

```typescript
export const buildUrls = (bagId: string) => ({
  tonUrl: `ton://${bagId}`,
  fallbackUrl: `https://ton.run/${bagId}`,
})
```

---

## テスト戦略

### ユニットテスト (CI で常時実行)

| ファイル | テスト内容 | daemon 必要? |
|---------|-----------|-------------|
| `detect.test.ts` | 各種ビルドディレクトリ検出ロジック | No |
| `daemon.test.ts` | バイナリDL URL 組み立て・platform 検出・バージョン管理 | No (モック) |
| `output.test.ts` | URL 構築・出力フォーマット | No |

### 統合テスト (オプション, CI で skip 可)

```bash
# 環境変数でスキップ
RUN_INTEGRATION=1 vitest run test/upload.test.ts
```

`upload.test.ts` は実際の `storage-daemon` を起動してbag を作成し、bag ID が返ってくることを確認。ローカル開発時のみ実行。

### カバレッジ目標

- ユニットテスト: 90%+ (detect, output, daemon ユーティリティ)
- E2E: 1本だけ (happy path: `./fixtures/minimal-site/` をアップロードしてbag ID を得る)

### テスト用フィクスチャ

```
test/
├── fixtures/
│   └── minimal-site/
│       ├── index.html
│       └── style.css
```

---

## 実装計画 (Day-by-Day)

### Day 1: セットアップ + detect.ts + output.ts

```bash
cd /Users/masashi_mac_ssd/Developer/ton-projects/sovereign-deploy-kit
git init
bun init  # or npm init
bun add commander ora chalk
bun add -D typescript vitest @types/node tsup
```

完成物:
- `package.json` (bin フィールド含む)
- `tsconfig.json`
- `src/detect.ts` + テスト (TDD)
- `src/output.ts` + テスト (TDD)

### Day 2: daemon.ts — バイナリ管理

完成物:
- `src/daemon.ts`: バイナリ存在確認 + DL + platform検出
- `test/daemon.test.ts`: モックベースのユニットテスト
- `~/.ton-sovereign/bin/` への保存ロジック

バイナリDL URL パターン:
```
https://github.com/ton-blockchain/ton/releases/download/<version>/storage-daemon-<platform>
```
platform 例: `storage-daemon-darwin-arm64`, `storage-daemon-linux-x86_64`

### Day 3: upload.ts — storage-daemon 連携

完成物:
- `src/daemon.ts` に process spawn/kill 追加
- `src/upload.ts`: `storage-daemon-cli` 経由でbag作成
- `test/fixtures/minimal-site/` 作成
- `test/upload.test.ts` (統合テスト)

### Day 4: cli.ts — 全部つなぐ

完成物:
- `src/cli.ts`: コマンドライン引数 + 全コンポーネント統合
- `bin/ton-sovereign-deploy` エントリポイント
- `npx ton-sovereign-deploy ./test/fixtures/minimal-site/` が動く

### Day 5: 仕上げ + README

完成物:
- エラーハンドリング全ケース確認
- `README.md` (DeFi frontend ユースケース例含む)
- `npm publish --dry-run` で動作確認

---

## リスクと対策

| リスク | 深刻度 | 対策 |
|--------|--------|------|
| storage-daemon バイナリのDL URL が変わる | 高 | バージョンを設定ファイルで管理、CLI 実行時にバージョン確認 |
| macOS の Gatekeeper がバイナリをブロック | 中 | `xattr -c` で quarantine 解除をDL後に自動実行 |
| storage-daemon のポート競合 | 中 | セッションごとにランダムポートを使用 |
| Windows 非対応 | 低 | v0.1 は macOS/Linux のみ。`package.json` の `os` フィールドで明示 |
| BAG の永続性 (誰も seeding しない) | 中 | ton.run fallback URL と合わせて、ユーザーに "keep your daemon running" を README に記載 |

---

## NOT In Scope (v0.1)

明示的に先送りするもの:

- `.ton DNS 登録` → v0.2 (設計は後で)
- `ton.run HTTP fallback 確認` → v0.2 (アップロード後に疎通確認)
- `--watch モード` → v0.3
- `GitHub Actions 連携` → v0.3
- `Windows サポート` → v0.3
- `npm publish CI/CD (GitHub Actions)` → v0.2 以降 (手動 publish で先行)
- `有料ストレージプロバイダ契約` → v0.3 (v0.1 は無料のセルフシーディング)

---

## 初日の実行コマンド

```bash
cd /Users/masashi_mac_ssd/Developer/ton-projects/sovereign-deploy-kit
git init
npm init -y
npm install commander ora chalk
npm install -D typescript vitest @types/node tsup
mkdir -p src test/fixtures/minimal-site bin
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | DONE | TONAPI前提を修正, storage-daemon auto-DL採用 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT:** ENG REVIEW 完了。主要アーキテクチャ決定済み。Day 1 から実装開始可能。
