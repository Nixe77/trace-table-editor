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
- `index.html`: アプリ本体。上から CSS → HTML → `<script>` PseudoLang（擬似言語インタプリタ）→ `<script>` JavaToPseudo（Java → 擬似言語）→ `<script>` PseudoToJava（擬似言語 → Java）→ `<script>` アプリ本体（IIFE）
- `README.md`: 利用者向け説明。機能を足したら必ず更新する
- `scripts/test.js`: 依存なしの回帰テスト。`node scripts/test.js`
- `.claude/settings.json`: Claude Code の権限（git add / commit / push と node を確認なしで実行可。force push と reset --hard は禁止）
- `LICENSE`: MIT

## index.html の構造（アプリ本体スクリプト）
- 状態: `state = { docs: [doc], currentId }`
  `doc = { id, title, code, vars: [{ id, name }], rows: [{ line, vals: { varId: value }, out, note }], settings: { lang, arrayBase, condRows, entryCall }, updated }`
- 描画: `renderCode`（行番号付きコード。行クリックでその場編集、右端の `.ln-add` でステップ追加）
- コード行のその場編集: `startLineEdit` / `closeLineEdit` / `insertCodeLine` / `removeEmptyCodeLine`。編集中の状態は `lineEditor` 1 個だけ。**`closeLineEdit` は先に `lineEditor = null` してから DOM を差し替える**（`replaceWith` で blur が飛んで再入するため）。クリックの受け口は `#codeLines` への委譲（`mousedown`）で、要素ごとにリスナを付けない（再描画で外れるため）。`renderCode` は先頭で `closeLineEdit(true)` を呼んで編集中の内容を取りこぼさない/ `renderVars`（変数チップ）/ `renderTable`（表。セル編集は再描画せず state だけ更新）
- 行・列の操作: `addRow` / `deleteRow` / `moveRow` / `addVars` / `removeVar` / `moveVar` / `pushUndo` / `undo`（表の構造変更に加えて `code` も undo 対象。コードを書き換える処理は必ず `pushUndo()` を呼ぶこと）
- エラー表示: `showTraceError(res)` が実行エラーの出し口。呼び出し式が要るときは `entrySuggestion` で関数名と引数の例を作り、`applyEntryCall` で欄に入れて引数部分を選択状態にする。`showAutoMsg(text, isError, line, action)` が見出し・本文・該当行の中身・操作ボタンを組み立て、`setErrorLine()` でコード側の行も赤くする。`errorLineOf(e)` で `JCError` / `PLError` の行番号を取り出して渡す。`renderCode` は `errorLine` を見て印を貼り直す
- 変数抽出: `extractVarNames`（Java の型付き宣言、擬似言語の `整数型: x`、Python 風代入）
- 入出力: `buildMarkdown` / `buildTSV` / `buildCSV` / `buildJSON` / `importJSON`
- 補助: `switchDoc` / `armConfirm`（2 回押しで確定する破壊的操作の確認）/ `toast`
- 自動トレース: `runAuto`（`PseudoLang.parse` → `run` のジェネレータを回す）/ `doAutoTrace`（表を置き換え）/ `doCheck`（答え合わせ。`alignRows` で行番号を LCS 整列し、`normCell` で正規化して比較）/ `stepStart` `stepNext` `stepToEnd` `stepAddRow` `stepStop`（1 ステップ実行）
- PseudoLang: `normalize`（全角→半角）→ `stripComments` → `toLines`（括弧が閉じるまで行を連結、インデント記録）→ `classify` → `parse`（再帰下降。`do … while (条件)` の終端 `while` は backtracking で判定。関数本体はインデントが浅くなった行で終了）→ `run`（`function*`。1 行実行ごとに `{ line, vars: [[name, display]], out, note, frame }` を yield。戻り値は `{ result, warnings, output }`）
- 行の生成ルール（手書きの慣習に合わせている。変えるときは README とアプリ内ヘルプも更新する）:
  宣言（初期値あり）1 行 / 宣言のみ 0 行 / 代入・出力・return 1 行 / if・elseif・while・do-while の条件判定 1 行（`condRows=false` で省略）/ for は各反復 1 行＋終了判定 1 行（ループ変数は終了値＋増分）/ 関数開始行（○）に引数の値を入れた 1 行

## JavaToPseudo の構造（Java → 擬似言語 変換器）

Java を直接実行するインタプリタは作らず、**擬似言語に変換してから PseudoLang で実行する**方式。こうすると行番号・行の生成ルール・答え合わせが擬似言語と完全に共通になる。

- `tokenize` → `Parser`（再帰下降で Java のサブセットを AST 化）→ `Emitter`（擬似言語のテキストを出力）→ `convert` が入口
- `convert(javaSource)` は `{ code, warnings, usesArray, hasMain, entryHint }` を返す。`errorMessage(e)` で行番号付きの日本語メッセージになる
- `Emitter` は変数の型環境（`scopes` / `methodRet`）を持つ。**整数どうしの `/` を `÷ … の商` にするために型推論が要る**（`7 / 2` が 3.5 になってしまうため）。`typeOf` を壊すとここが静かに壊れるので注意
- 出力順は 大域（static フィールド）→ `○` 関数（static メソッド）→ main の中身。関数の本体はインデント 1 段で出す（PseudoLang は浅くなった行で関数本体の終わりを判定するため）
- `for` は標準形（`i` の初期化・`i < n` 等・`i++` / `i += n`、かつ本体で `i` を書き換えない）のときだけ擬似言語の `for` にする。外れたら while 形に落として警告を出す
- 配列は **Java に合わせて必ず 0 始まり**で出力する。`usesArray` が真なら呼び出し側（`applyConvertedSettings`）が `arrayBase` を 0 にする
- `break` / `continue` / `printf` / 文字列のメソッド / 式の中の `++`・代入 は、黙って落とさず必ずエラーにする（意味が変わるため）
- 擬似言語の予約語（`and` `or` `not` `mod` `true` `false`）と同じ Java 変数名は `safe()` が改名する
- **`lineMap` が Java の自動トレースの要**。出力した擬似言語の 1 行ごとに元の Java の行番号を控えた配列で、`lineMap[擬似言語の行 - 1]` が Java の行になる。`out()` が `lines` と `src` を必ず同時に積むので、行を出す処理を足すときは `push` / `raw` を経由すること（`this.lines.push` を直接呼ぶとマップがずれる）
- `raw()` は行番号を省くと直前の行を引き継ぐ。**トレースの行になる擬似言語（`for` の見出し、do-while の `while (条件)`、三項演算子を展開した代入、空メソッドの `return`）は必ず行番号を明示する**。`endif` などは行にならないので引き継ぎで構わない

## Java の自動トレースの仕組み

Java 用のインタプリタは無い。`prepareRun()`（アプリ本体）が言語を見て、Java なら `JavaToPseudo.convert` → `PseudoLang.parse` → 実行し、`mapLine()` で各ステップの行番号を Java の行へ戻している。表・1ステップ実行・答え合わせ・実行時エラーはすべてこの 1 箇所を通るので、ここを直せば 3 つとも直る。

- Java のときは `arrayBase` を必ず 0 にする（変換後の擬似言語が 0 始まりで出ているため）。UI 側でも選択を無効化している
- 変換の失敗（`JCError`）と実行の失敗（`PLError`）は `traceErrorMessage()` で出し分ける

## PseudoToJava の構造（擬似言語 → Java 変換器）

**Java 用のパーサは書いていない。`PseudoLang.parse()` が返す構文木をそのまま入力にしている**ので、擬似言語の文法を足したらこちらの `stmt` / `exp` にも分岐を足すこと。

- `convert(src, { arrayBase, entryCall, className })` → `{ code, warnings }`
- 配列の次元は構文木に残らない（`parseDecl` が `baseTypeOf` で潰し、`isArray` の真偽しか持たない）。そのため `buildTypeIndex` が `P.lines` の元テキストから型文字列を拾い直して「配列」の出現回数を数えている。宣言まわりを触るときはここも合わせる
- **キャストの向きが逆になりやすい**。擬似言語の `÷` は実数除算なので Java では `(double) a / b`、`÷ … の商` は `a / b`（int どうしのとき）。`infer` を壊すとここが静かに逆になる
- 擬似言語は関数スコープ、Java はブロックスコープ。`scanDecls` で入れ子（depth > 0）の宣言と、`scanImplicit` で宣言なし代入の変数を集め、メソッド先頭でまとめて宣言する。`scanImplicit` は `lookup` で大域変数と引数を除外すること（除外しないと static フィールドを隠すローカルを作ってコンパイルが通らなくなる）
- `arrayBase` が 1 のときは要素番号から 1 引く。`shiftIndex` が定数畳み込みをするので `a[1]` → `a[0]`、`a[i ＋ 1]` → `a[i]` になる
- `末尾に追加する` は `appendInt` 等のヘルパーを生成して再現する（Java の配列は長さを変えられないため）

## テストの考え方

`scripts/test.js` は 3 段構え。変換器を触ったら 3 つとも通すこと。

1. 擬似言語インタプリタ単体（IPA サンプル問題）
2. **行マップ（`JT` で始まるケース）**: Java を直接トレースし、各行が Java の何行目を指すかを配列で固定している。`lineMap` を壊すとここが落ちる
3. **往復テスト（`P2J`）**: 擬似言語 → Java → 擬似言語 と戻して、出力が元と一致するか。JDK なしで動くのでここが主戦力
4. **javac での実コンパイル**: JDK があれば生成した Java を `javac` でコンパイルして実行し、擬似言語の出力と突き合わせる。無ければ自動でスキップ（`SKIP` と表示される）

## 次にやること（優先順）
1. 答え合わせの精度向上（Java の配列表記 `[1, 2]` と `{1, 2}` の同一視、文字列の引用符の有無）
2. 変換の対応範囲を広げる（`printf` の `%d` `%s` `%.2f` 程度、`String` の `charAt()`）。PseudoLang 側に対応する機能がないので、まず擬似言語側の拡張から。`length()` と `equals()` は対応済み
3. モバイル表示の調整（表の横スクロール、ボタンの大きさ）

## 動作確認の手順（commit 前に必須）
1. `node scripts/test.js` が全て PASS すること（構文チェック＋擬似言語の回帰テスト＋両方向の変換＋javac での実コンパイル）。機能を足したらケースも足す
2. UI に触れる変更は、ブラウザでの見た目と操作を Claude Code からは確認できない。変更点と確認してほしい操作をユーザーに伝え、確認結果を待ってから push する。ロジックだけの変更（インタプリタ、テスト、README）はテストが通れば push してよい

## Git 運用
- ブランチは `main` のみ。動作確認が通ったら `git add -A` → `git commit -m "<日本語で変更内容>"` → `git push`
- コミットメッセージは「何を」「なぜ」を日本語で 1 行。例: `Java の自動トレースを追加（授業の println 課題に対応）`
- push は確認なしで実行してよい（`.claude/settings.json` で許可済み）。ただし動作確認が通っていないときは push しない
- 禁止: force push、`git reset --hard`、ブランチ削除、`rm -rf`、`.git` の直接編集
