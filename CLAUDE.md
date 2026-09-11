# トレース表エディタ — Claude Code 向けプロジェクトメモ

## これは何か
- プログラムのトレース表（ステップごとの変数の値）を記入・自動生成する単一 HTML ツール。`index.html` 1 ファイル、外部依存なし、オフライン動作、日本語 UI
- 用途: 基本情報技術者試験 科目B の擬似言語と、授業で扱う Java を手でトレースする練習
- 公開先: GitHub Pages（main ブランチ / root）。push すると 1〜2 分で反映される
- 作者は職業訓練校で Java と基本情報を学習中。説明は簡潔に、専門用語には短い補足を付ける

## 守ること（設計ルール）
1. `index.html` 1 ファイル構成を維持する。外部ライブラリ・CDN・ビルド工程・フレームワークを入れない
2. 保存データの互換を壊さない。localStorage キー `traceTableEditor.v1`、書き出し JSON の `format: "trace-table/v1"`。フィールドの追加は可、削除・改名は不可
3. UI 文言は日本語。ユーザーが指定した文言は言い換えない
4. 回答・コミットメッセージは日本語。説明は表組みを使わずテキストで、簡潔に
5. 「動作確認の手順」を通してから commit・push する。通らないときは push しない

## ファイル構成
- `index.html`: アプリ本体。上から CSS → HTML → `<script>` PseudoLang（擬似言語インタプリタ）→ `<script>` アプリ本体（IIFE）
- `README.md`: 利用者向け説明。機能を足したら必ず更新する
- `scripts/test.js`: 依存なしの回帰テスト。`node scripts/test.js`
- `.claude/settings.json`: Claude Code の権限（git add / commit / push と node を確認なしで実行可。force push と reset --hard は禁止）
- `LICENSE`: MIT

## index.html の構造（アプリ本体スクリプト）
- 状態: `state = { docs: [doc], currentId }`
  `doc = { id, title, code, vars: [{ id, name }], rows: [{ line, vals: { varId: value }, out, note }], settings: { lang, arrayBase, condRows, entryCall }, updated }`
- 描画: `renderCode`（行番号付きコード。行クリックでステップ追加）/ `renderVars`（変数チップ）/ `renderTable`（表。セル編集は再描画せず state だけ更新）
- 行・列の操作: `addRow` / `deleteRow` / `moveRow` / `addVars` / `removeVar` / `moveVar` / `pushUndo` / `undo`（構造変更のみ undo 対象）
- 変数抽出: `extractVarNames`（Java の型付き宣言、擬似言語の `整数型: x`、Python 風代入）
- 入出力: `buildMarkdown` / `buildTSV` / `buildCSV` / `buildJSON` / `importJSON`
- 補助: `switchDoc` / `armConfirm`（2 回押しで確定する破壊的操作の確認）/ `toast`
- 自動トレース: `runAuto`（`PseudoLang.parse` → `run` のジェネレータを回す）/ `doAutoTrace`（表を置き換え）/ `doCheck`（答え合わせ。`alignRows` で行番号を LCS 整列し、`normCell` で正規化して比較）/ `stepStart` `stepNext` `stepToEnd` `stepAddRow` `stepStop`（1 ステップ実行）
- PseudoLang: `normalize`（全角→半角）→ `stripComments` → `toLines`（括弧が閉じるまで行を連結、インデント記録）→ `classify` → `parse`（再帰下降。`do … while (条件)` の終端 `while` は backtracking で判定。関数本体はインデントが浅くなった行で終了）→ `run`（`function*`。1 行実行ごとに `{ line, vars: [[name, display]], out, note, frame }` を yield。戻り値は `{ result, warnings, output }`）
- 行の生成ルール（手書きの慣習に合わせている。変えるときは README とアプリ内ヘルプも更新する）:
  宣言（初期値あり）1 行 / 宣言のみ 0 行 / 代入・出力・return 1 行 / if・elseif・while・do-while の条件判定 1 行（`condRows=false` で省略）/ for は各反復 1 行＋終了判定 1 行（ループ変数は終了値＋増分）/ 関数開始行（○）に引数の値を入れた 1 行

## 次にやること（優先順）
1. Java の自動トレース: `#lang` セレクトの Java を有効化し、`JavaLang`（`parse` / `run` / `errorMessage` を PseudoLang と同じインターフェースで実装）を別の `<script>` として追加。`runAuto` `stepStart` で `settings.lang` により切り替える
   対応範囲: `main` の中の `int` `long` `double` `boolean` `char` `String`、配列（`int[] a = {1, 2}` / `new int[n]` / `a.length`）、`for` `while` `do-while` `if/else` `switch`、`++` `--` `+=` 等の複合代入、三項演算子、`System.out.println` / `print` / `printf`（`%d` `%s` `%f` `%.2f` `%n`）、`static` メソッドの定義と呼び出し（再帰含む）。クラス・オブジェクト・`String` のメソッドは `length()` `charAt()` `equals()` 程度まで
   行の生成ルールは擬似言語と同じ。`for (int i = 1; i <= n; i++)` は各反復の条件判定で 1 行（i の更新後）＋終了判定 1 行
   テストは `scripts/test.js` に Java のケースを追加する
2. 答え合わせの精度向上（Java の配列表記 `[1, 2]` と `{1, 2}` の同一視、文字列の引用符の有無）
3. モバイル表示の調整（表の横スクロール、ボタンの大きさ）

## 動作確認の手順（commit 前に必須）
1. `node scripts/test.js` が全て PASS すること（構文チェック＋擬似言語の回帰テスト）。機能を足したらケースも足す
2. UI に触れる変更は、ブラウザでの見た目と操作を Claude Code からは確認できない。変更点と確認してほしい操作をユーザーに伝え、確認結果を待ってから push する。ロジックだけの変更（インタプリタ、テスト、README）はテストが通れば push してよい

## Git 運用
- ブランチは `main` のみ。動作確認が通ったら `git add -A` → `git commit -m "<日本語で変更内容>"` → `git push`
- コミットメッセージは「何を」「なぜ」を日本語で 1 行。例: `Java の自動トレースを追加（授業の println 課題に対応）`
- push は確認なしで実行してよい（`.claude/settings.json` で許可済み）。ただし動作確認が通っていないときは push しない
- 禁止: force push、`git reset --hard`、ブランチ削除、`rm -rf`、`.git` の直接編集
