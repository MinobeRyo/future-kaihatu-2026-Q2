# 積み音（つみね）

音楽コード学習アプリ v2（完全新規リビルド）。

旧アプリ（future-kaihatu/音楽コード勉強アプリ）のロジックを参考に、全ファイル新規で開発する。
設計方針・機能の詳細は `../企画書.md` を参照。

## 名称の表記ルール

- 正式表記は **積み音（つみね）**。ローマ字は `TUMINE`
- 初出・ロゴ・ポスターでは必ず読みを併記する（「つみおと」と誤読されるため）
- 画面内のブランド表示は「積み音」、`<title>` は「〇〇モード | 積み音（つみね）」で統一
- 由来: コードは音を積み上げてできている（練習モードの「音の積み木」がそのまま名前）

## 構成

```
app/
├── js/
│   ├── core/    # 共通エンジン（DOMに依存しない）
│   │   ├── musicTheory.js  # 理論エンジン: コード計算・テンション・度数解析・移調・進行マッチング
│   │   ├── audioEngine.js  # 再生エンジン: AudioContext時刻ベース・確実な停止・複数トラック同時再生
│   │   ├── timeline.js     # 曲の状態: chord/melody/bass の3トラック・長さ・並び順・休符
│   │   └── songFile.js     # 保存形式: 状態⇄プレーンなオブジェクト（＋いまはJSONファイル入出力）
│   ├── data/    # データ（文言・進行・楽曲DB）
│   │   ├── progressions.js # プリセット進行（度数ベース定義）
│   │   ├── songs.js        # 既存楽曲DB＋逆引き検索
│   │   └── captions.js     # 初心者向けリアルタイム解説の文言
│   └── pages/   # 各ページのUIロジック（core/dataを呼ぶだけの薄い層）※これから作る
├── css/         # ※これから作る
└── tests/
    ├── selftest.mjs       # core/data のセルフテスト（node tests/selftest.mjs）
    └── composeSmoke.mjs   # 作曲ページのDOM配線テスト（要 jsdom / node tests/composeSmoke.mjs）
```

テストの実行:

```bash
cd app
node tests/selftest.mjs        # 依存なし
npm i -D jsdom                 # composeSmoke.mjs のみ jsdom が必要
node tests/composeSmoke.mjs
```

## 設計ルール

1. コード計算・度数解析は必ず `musicTheory.js` を使う（旧アプリの三重実装を繰り返さない）
2. 音を鳴らす処理は必ず `audioEngine.js` を使う（停止できない再生を作らない）
3. 進行・楽曲・解説文はすべて度数ベースの「データ」として `data/` に置き、ロジックに文言を埋め込まない
4. `core/` と `data/` は DOM・window に依存させない（Nodeでテストできる状態を保つ）
5. console.log を残さない（デバッグは selftest とブラウザ devtools で行う)
6. コードトラックは **配列の並び順＝曲の並び順**。`startCount` は手で触らず、変更後に必ず
   `relayoutChords()` で振り直す（隙間・重なりを原理的に発生させないため）
7. 曲の保存は `songFile.js` の `serializeSong` / `deserializeSong` を通す。
   この2つはDOMにもfetchにも依存しないので、**DB保存に移行してもそのまま使える**
   （置き換わるのは `downloadSong` / `readSongFile` のファイル入出力層だけ）

## 曲の保存（現状は仮実装）

いまは「JSONファイルに書き出す／読み込む」のみ。形式は `songFile.js` の `SONG_FORMAT_VERSION`
でバージョン管理していて、読み込み時は必ず値を検証してから使う（壊れたファイルで画面が死なない）。
将来のDB保存では、`serializeSong()` の戻り値をそのままレコードとして送る想定。

## 楽曲DBの運用ルール

`songs.js` の楽曲紐付けは、アプリに表示する前に耳＋コード譜サイトで検証し `verified: true` にすること。
