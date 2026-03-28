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

**ステータス:** 実装前 (2026-03-28 現在)
**最初の公開ターゲット:** Gateway 2026 (2026年5月)

詳細な実装計画: [PLAN.md](./PLAN.md)
