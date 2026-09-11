// 依存なしの回帰テスト:  node scripts/test.js
// 1) index.html 内の <script> を構文チェック
// 2) 擬似言語インタプリタ（PseudoLang）を取り出して IPA サンプル問題で結果を検証
// 3) Java → 擬似言語 変換器（JavaToPseudo）を取り出し、変換結果を実際に実行して検証
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (detail ? '  -> ' + detail : '')); } }

// 1) 構文チェック
scripts.forEach((src, i) => {
  try { new vm.Script(src, { filename: `index.html <script #${i + 1}>` }); ok(`syntax: script #${i + 1}`, true); }
  catch (e) { ok(`syntax: script #${i + 1}`, false, e.message); }
});
ok('scripts: 4 blocks (PseudoLang + JavaToPseudo + PseudoToJava + app)', scripts.length === 4, 'found ' + scripts.length);

// 2) PseudoLang / JavaToPseudo / PseudoToJava を取り出す
const plSrc = scripts.find(s => s.includes('const PseudoLang = (() => {'));
const j2pSrc = scripts.find(s => s.includes('const JavaToPseudo = (() => {'));
const p2jSrc = scripts.find(s => s.includes('const PseudoToJava = (() => {'));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(plSrc + '\nthis.PseudoLang = PseudoLang;', sandbox);
vm.runInContext(j2pSrc + '\nthis.JavaToPseudo = JavaToPseudo;', sandbox);
vm.runInContext(p2jSrc + '\nthis.PseudoToJava = PseudoToJava;', sandbox);
const PseudoLang = sandbox.PseudoLang;
const JavaToPseudo = sandbox.JavaToPseudo;
const PseudoToJava = sandbox.PseudoToJava;

function trace(code, opts = {}) {
  const steps = []; let ret, err = null;
  try {
    const P = PseudoLang.parse(code);
    const g = PseudoLang.run(P, Object.assign({ maxSteps: 2000 }, opts));
    let r; while (!(r = g.next()).done) steps.push(r.value);
    ret = r.value;
  } catch (e) { err = PseudoLang.errorMessage(e); }
  return { steps, ret, err };
}
const J = v => JSON.stringify(v);

// --- IPA 科目B サンプル問題 ---
let r = trace(`整数型: x ← 1
整数型: y ← 2
整数型: z ← 3
x ← y
y ← z
z ← x
yの値 と zの値 をこの順にコンマ区切りで出力する`);
ok('問1 出力 3,2', !r.err && J(r.ret.output) === J(['3,2']), r.err || J(r.ret && r.ret.output));

r = trace(`○文字列型: fizzBuzz(整数型: num)
  文字列型: result
  if (num が 3 と 5 で割り切れる)
    result ← "3 と 5 で割り切れる"
  elseif (num が 3 で割り切れる)
    result ← "3 で割り切れる"
  elseif (num が 5 で割り切れる)
    result ← "5 で割り切れる"
  else
    result ← "3 でも 5 でも割り切れない"
  endif
  return result`, { entryCall: 'fizzBuzz(15)' });
ok('問2 fizzBuzz(15)', !r.err && r.ret.result === '3 と 5 で割り切れる', r.err || J(r.ret && r.ret.result));

r = trace(`○整数型の配列: makeNewArray(整数型の配列: in)
  整数型の配列: out ← {}
  整数型: i, tail
  outの末尾 に in[1]の値 を追加する
  for (i を 2 から inの要素数 まで 1 ずつ増やす)
    tail ← out[outの要素数]
    outの末尾 に (tail ＋ in[i]) の結果を追加する
  endfor
  return out`, { entryCall: 'makeNewArray({3, 2, 1, 6, 5, 4})' });
ok('問3 makeNewArray 要素5=17', !r.err && r.ret.result[4] === 17, r.err || J(r.ret && r.ret.result));

r = trace(`○整数型: gcd(整数型: num1, 整数型: num2)
  整数型: x ← num1
  整数型: y ← num2
  while (x ≠ y)
    if (x ＞ y)
      x ← x － y
    else
      y ← y － x
    endif
  endwhile
  return x`, { entryCall: 'gcd(12, 18)' });
ok('問4 gcd(12,18)=6', !r.err && r.ret.result === 6, r.err || J(r.ret && r.ret.result));
ok('問4 行数 11', r.steps.length === 11, 'steps=' + r.steps.length);

r = trace(`○整数型: factorial(整数型: n)
  if (n ＝ 0)
    return 1
  endif
  return n × factorial(n － 1)`, { entryCall: 'factorial(5)' });
ok('問7 factorial(5)=120', !r.err && r.ret.result === 120, r.err || J(r.ret && r.ret.result));

r = trace(`大域: 整数型配列の配列: tree ← {{2, 3}, {4, 5}, {6, 7}, {8, 9},
{10, 11}, {12, 13}, {14}, {}, {}, {},
{}, {}, {}, {}}
○order(整数型: n)
  if (tree[n]の要素数 が 2 と等しい)
    order(tree[n][1])
    nを出力
    order(tree[n][2])
  elseif (tree[n]の要素数 が 1 と等しい)
    order(tree[n][1])
    nを出力
  else
    nを出力
  endif`, { entryCall: 'order(1)' });
ok('問9 order 出力順', !r.err && r.ret.output.join(',') === '8,4,9,2,10,5,11,1,12,6,13,3,14,7', r.err || (r.ret && r.ret.output.join(',')));

r = trace(`○整数型の配列: binSort(整数型の配列: data)
  整数型: n ← dataの要素数
  整数型の配列: bins ← {n個の未定義の値}
  整数型: i
  for (i を 1 から n まで 1 ずつ増やす)
    bins[data[i]] ← data[i]
  endfor
  return bins`, { entryCall: 'binSort({2, 6, 3, 1, 4, 5})' });
ok('問11 binSort', !r.err && J(r.ret.result) === J([1, 2, 3, 4, 5, 6]), r.err || J(r.ret && r.ret.result));

r = trace(`○実数型: findRank(実数型の配列: sortedData, 実数型: p)
  整数型: i
  i ← (p × (sortedDataの要素数 － 1)) の小数点以下を切り上げた値
  return sortedData[i ＋ 1]
○実数型の配列: summarize(実数型の配列: sortedData)
  実数型の配列: rankData ← {}
  実数型の配列: p ← {0, 0.25, 0.5, 0.75, 1}
  整数型: i
  for (i を 1 から pの要素数 まで 1 ずつ増やす)
    rankDataの末尾 に findRank(sortedData, p[i])の戻り値 を追加する
  endfor
  return rankData`, { entryCall: 'summarize({0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1})' });
ok('問14 summarize', !r.err && J(r.ret.result) === J([0.1, 0.4, 0.6, 0.8, 1]), r.err || J(r.ret && r.ret.result));

r = trace(`○整数型の配列: encode(整数型: codePoint)
  整数型の配列: utf8Bytes ← {224, 128, 128}
  整数型: cp ← codePoint
  整数型: i
  for (i を utf8Bytesの要素数 から 1 まで 1 ずつ減らす)
    utf8Bytes[i] ← utf8Bytes[i] ＋ (cp ÷ 64 の余り)
    cp ← cp ÷ 64 の商
  endfor
  return utf8Bytes`, { entryCall: 'encode(12354)' });
ok('問16 encode(3042h)', !r.err && J(r.ret.result) === J([227, 129, 130]), r.err || J(r.ret && r.ret.result));

// --- 構文・実行の細かい仕様 ---
r = trace(`整数型: i ← 0, 合計 ← 0
do
  i ← i + 1
  while (合計 < 3)
    合計 ← 合計 + i
  endwhile
while (i < 2)
合計 を出力する`);
ok('do-while の中の while を区別', !r.err && J(r.ret.output) === J(['3']), r.err || J(r.ret && r.ret.output));

r = trace(`○整数型: sq(整数型: x)
  return x × x
整数型: r
r <- sq(4)
r を出力する`);
ok('関数の後の main 文（インデントで区切り）', !r.err && J(r.ret.output) === J(['16']), r.err || J(r.ret && r.ret.output));

r = trace(`整数型の配列: d ← {1, 2}
d[3] ← 5`);
ok('配列の範囲外はエラー', /範囲外/.test(r.err || ''), r.err);

r = trace(`整数型: i ← 0
while (true)
  i ← i + 1
endwhile`, { maxSteps: 30 });
ok('無限ループは上限で停止', /上限/.test(r.err || ''), r.err);

r = trace(`整数型: y ← 7 ÷ 2`);
ok('整数型への小数代入は切り捨て＋注意', !r.err && r.steps[0].vars[0][1] === '3' && r.ret.warnings.length === 1, r.err || J(r.steps[0] && r.steps[0].vars));

r = trace(`整数型: x ← 5
if (x が 3 以上 and not (x が 10 以上))
  "ok" を出力する
endif`, { condRows: false });
ok('日本語条件 + and/not、condRows=false', !r.err && J(r.ret.output) === J(['ok']) && r.steps.length === 2, r.err || ('steps=' + r.steps.length));

// --- Java → 擬似言語 変換 ---
// 変換したコードを実際に実行し、Java として動かしたときの出力と一致するかを見る
function runJava(src, entry) {
  let conv;
  try { conv = JavaToPseudo.convert(src); }
  catch (e) { return { err: JavaToPseudo.errorMessage(e) }; }
  // アプリと同じ設定の決め方（配列を使うなら Java に合わせて 0 始まり）
  const opts = { arrayBase: conv.usesArray ? 0 : 1 };
  if (!conv.hasMain && conv.entryHint) opts.entryCall = entry || conv.entryHint;
  const t = trace(conv.code, opts);
  return { code: conv.code, warnings: conv.warnings, err: t.err, out: t.err ? null : t.ret.output, result: t.err ? null : t.ret.result, steps: t.steps };
}
function jOk(name, src, expected, entry) {
  const r = runJava(src, entry);
  ok('J2P ' + name, !r.err && J(r.out) === J(expected), r.err || J(r.out) + '\n--- 変換結果 ---\n' + (r.code || ''));
}
function jErr(name, src, re) {
  const r = runJava(src);
  ok('J2P エラー ' + name, !!r.err && re.test(r.err), r.err || '変換が通ってしまった:\n' + (r.code || ''));
}

jOk('for と合計', `int sum = 0;
for (int i = 1; i <= 3; i++) { sum = sum + i; }
System.out.println(sum);`, ['6']);

// Java の整数除算は切り捨て。÷ … の商 に変換されていないと 0.5 などになる
jOk('整数除算 / 実数除算 / 剰余', `int a = 7;
System.out.println(a / 2);
System.out.println(a / 2.0);
System.out.println(a % 2);
System.out.println(1 / 2);`, ['3', '3.5', '1', '0']);

jOk('配列と .length', `int[] a = {3, 9, 4};
int m = a[0];
for (int i = 1; i < a.length; i++) { if (a[i] > m) { m = a[i]; } }
System.out.println(m);`, ['9']);

jOk('new int[n] への代入', `int n = 3;
int[] a = new int[n];
for (int i = 0; i < n; i++) { a[i] = i * i; }
System.out.println(a[2]);`, ['4']);

jOk('2 次元配列', `int[][] m = {{1, 2}, {3, 4}};
int s = 0;
for (int i = 0; i < 2; i++) { for (int j = 0; j < 2; j++) { s += m[i][j]; } }
System.out.println(s);`, ['10']);

jOk('拡張 for', `int[] a = {1, 2, 3};
int s = 0;
for (int v : a) { s += v; }
System.out.println(s);`, ['6']);

jOk('減少 for', `for (int i = 3; i > 0; i--) { System.out.println(i); }`, ['3', '2', '1']);

jOk('while と複合代入と /=', `int n = 10;
int c = 0;
while (n > 1) {
  if (n % 2 == 0) { n /= 2; } else { n = 3 * n + 1; }
  c += 1;
}
System.out.println(c);`, ['6']);

jOk('do-while', `int i = 0;
do { i++; } while (i < 3);
System.out.println(i);`, ['3']);

jOk('static メソッドと再帰', `public class Main {
  static int fact(int n) {
    if (n <= 1) { return 1; }
    return n * fact(n - 1);
  }
  public static void main(String[] args) { System.out.println(fact(5)); }
}`, ['120']);

jOk('static フィールドは大域に', `public class Main {
  static int g = 5;
  static int twice() { return g * 2; }
  public static void main(String[] args) { System.out.println(twice()); }
}`, ['10']);

jOk('switch は if / elseif に', `int x = 2;
String s;
switch (x) {
  case 1: s = "one"; break;
  case 2:
  case 3: s = "two or three"; break;
  default: s = "other";
}
System.out.println(s);`, ['two or three']);

jOk('三項演算子は代入の右辺で展開', `int a = 5, b = 9;
int m = a > b ? a : b;
System.out.println(m);`, ['9']);

jOk('文字列連結・char・cast・Math', `String t = "taro";
char c = 'x';
double d = 2.7;
System.out.println("hi " + t);
System.out.println(c);
System.out.println((int) d);
System.out.println(Math.abs(-4));`, ['hi taro', 'x', '2', '4']);

jOk('標準形でない for は while に', `int i = 0;
for (; i * i < 20; ) { i++; }
System.out.println(i);`, ['5']);

r = runJava(`static int add(int a, int b) { return a + b; }`, 'add(3, 4)');
ok('J2P main のないコードは呼び出し式で実行', !r.err && r.result === 7, r.err || J(r.result) + '\n' + (r.code || ''));

r = runJava(`// 合計
int s = 0; // 初期化
for (int i = 1; i <= 2; i++) { s += i; }`);
ok('J2P コメントを残す', !r.err && /\/\/ 合計/.test(r.code) && /\/\/ 初期化/.test(r.code), r.err || r.code);

r = runJava(`int not = 1;
System.out.println(not + 1);`);
ok('J2P 予約語と同じ変数名は改名', !r.err && J(r.out) === J(['2']) && /not_/.test(r.code), r.err || r.code);

jErr('break', `while (true) { break; }`, /break/);
jErr('continue', `for (int i = 0; i < 3; i++) { if (i == 1) continue; }`, /continue/);
jOk('文字列の .length() と .equals()', `String s = "abc";
System.out.println(s.length());
if (s.equals("abc")) { System.out.println("same"); }`, ['3', 'same']);
jErr('対応外の文字列メソッド', `String s = "ab"; System.out.println(s.charAt(0));`, /charAt/);
jErr('printf', `System.out.printf("%d", 1);`, /printf/);
jErr('式の中の ++', `int[] a = {1, 2}; int i = 0; int x = a[i++];`, /\+\+/);
jErr('オブジェクト生成', `Scanner sc = new Scanner(System.in);`, /new/);
jErr('フォールスルーする switch', `int x = 1;
switch (x) { case 1: x = 2; case 2: x = 3; break; }`, /フォールスルー/);

// アプリ内の Java サンプルが実際に変換・実行できること
const javaSample = (html.match(/const JAVA_SAMPLE_CODE = `([\s\S]*?)`;/) || [])[1];
ok('J2P アプリの Java サンプルが存在', !!javaSample);
if (javaSample) jOk('アプリの Java サンプル', javaSample, ['9']);

// --- Java の自動トレース（擬似言語に直して実行し、行番号を Java に戻す） ---
// アプリの prepareRun() と同じ手順
function javaTrace(src, opts = {}) {
  const conv = JavaToPseudo.convert(src);
  const map = conv.lineMap || [];
  const P = PseudoLang.parse(conv.code);
  const g = PseudoLang.run(P, Object.assign({ arrayBase: 0, condRows: true, maxSteps: 2000 }, opts));
  const steps = []; let r, err = null;
  try { while (!(r = g.next()).done) steps.push({ ...r.value, line: map[r.value.line - 1] }); }
  catch (e) { err = { msg: e.message, line: e.line ? map[e.line - 1] : 0 }; }
  return { steps, lines: steps.map(s => s.line), out: r && r.done ? r.value.output : [], map, conv, err };
}

let jt = javaTrace(`int sum = 0;
for (int i = 1; i <= 3; i++) {
    sum = sum + i;
}
System.out.println(sum);`);
ok('JT for の行番号が Java の行を指す', J(jt.lines) === J([1, 2, 3, 2, 3, 2, 3, 2, 5]), J(jt.lines));
ok('JT for の出力', J(jt.out) === J(['6']), J(jt.out));

jt = javaTrace(`int x = 5;
if (x > 3) {
    System.out.println("big");
} else {
    System.out.println("small");
}
System.out.println("done");`);
ok('JT if の行番号', J(jt.lines) === J([1, 2, 3, 7]), J(jt.lines));
ok('JT if の出力', J(jt.out) === J(['big', 'done']), J(jt.out));

jt = javaTrace(`int i = 0;
do {
    i++;
} while (i < 3);`);
// do-while の条件判定は Java の「} while (...)」の行（4 行目）を指すこと
ok('JT do-while の条件は while の行', J(jt.lines) === J([1, 3, 4, 3, 4, 3, 4]), J(jt.lines));

jt = javaTrace(`public class Main {
    static int twice(int n) {
        return n * 2;
    }
    public static void main(String[] args) {
        System.out.println(twice(4));
    }
}`);
// 2 = メソッドの開始行（引数の値が入る行）、3 = return、6 = println
ok('JT メソッド呼び出しの行番号', J(jt.lines) === J([2, 3, 6]), J(jt.lines));
ok('JT メソッドの出力', J(jt.out) === J(['8']), J(jt.out));

jt = javaTrace(`int[] a = {1, 2};
System.out.println(a[5]);`);
ok('JT 実行時エラーの行番号も Java の行', !!jt.err && jt.err.line === 2 && /範囲外/.test(jt.err.msg), J(jt.err));

// 行マップは擬似言語の行数と一致し、すべて元の Java の行を指すこと
const jtSrc = (html.match(/const JAVA_SAMPLE_CODE = `([\s\S]*?)`;/) || [])[1];
if (jtSrc) {
  const c = JavaToPseudo.convert(jtSrc);
  const pseudoLineCount = c.code.replace(/\n$/, '').split('\n').length;
  const javaLineCount = jtSrc.split('\n').length;
  ok('JT 行マップの長さが擬似言語の行数と一致', c.lineMap.length === pseudoLineCount, c.lineMap.length + ' vs ' + pseudoLineCount);
  ok('JT 行マップが Java の行範囲に収まる', c.lineMap.every(n => n >= 1 && n <= javaLineCount), J(c.lineMap));
  const t = javaTrace(jtSrc);
  ok('JT アプリの Java サンプルを直接トレース', J(t.out) === J(['9']) && t.lines.every(n => n >= 1 && n <= javaLineCount), J(t.out) + ' ' + J(t.lines));
}

// --- 擬似言語 → Java 変換 ---
// 擬似言語の実行結果と、変換した Java を擬似言語に戻して実行した結果が一致するかを見る（往復テスト）
// JDK があれば、生成した Java を実際に javac でコンパイルして実行結果も突き合わせる
function pseudoOut(code, opts) {
  const t = trace(code, opts);
  if (t.err) return { err: t.err };
  // main のないコードは戻り値が答え（生成した Java もそれを println する）
  const out = t.ret.output.length || t.ret.result === undefined ? t.ret.output : [PseudoLang.outDisp(t.ret.result)];
  return { out };
}
const normNum = list => list.map(s => String(s) === '(改行)' ? '' : String(s).replace(/^(-?\d+)\.0$/, '$1'));

function pjOk(name, pseudo, opts = {}) {
  const base = pseudoOut(pseudo, opts);
  if (base.err) { ok('P2J ' + name, false, '擬似言語の実行に失敗: ' + base.err); return null; }
  let conv;
  try { conv = PseudoToJava.convert(pseudo, opts); }
  catch (e) { ok('P2J ' + name, false, PseudoToJava.errorMessage(e)); return null; }

  // 生成した Java を擬似言語に戻して、同じ出力になるか
  let rt;
  try {
    const back = JavaToPseudo.convert(conv.code);
    rt = pseudoOut(back.code, { arrayBase: back.usesArray ? 0 : 1 });
  } catch (e) { ok('P2J ' + name, false, '往復に失敗: ' + JavaToPseudo.errorMessage(e) + '\n--- Java ---\n' + conv.code); return null; }
  if (rt.err) { ok('P2J ' + name, false, '往復の実行に失敗: ' + rt.err + '\n--- Java ---\n' + conv.code); return null; }

  const same = J(normNum(rt.out)) === J(normNum(base.out));
  ok('P2J ' + name, same, J(normNum(base.out)) + ' vs ' + J(normNum(rt.out)) + '\n--- Java ---\n' + conv.code);
  return same ? { code: conv.code, expected: normNum(base.out) } : null;
}

const P2J_CASES = [];
function pj(name, pseudo, opts) { const r = pjOk(name, pseudo, opts); if (r) P2J_CASES.push({ name, ...r }); }

pj('1 始まり配列と for', `整数型の配列: a ← {3, 9, 4, 1, 7}
整数型: m ← a[1]
整数型: i
for (i を 2 から aの要素数 まで 1 ずつ増やす)
  if (a[i] ＞ m)
    m ← a[i]
  endif
endfor
m を出力する`);

pj('gcd（関数と呼び出し式）', `○整数型: gcd(整数型: num1, 整数型: num2)
  整数型: x ← num1
  整数型: y ← num2
  while (x ≠ y)
    if (x ＞ y)
      x ← x － y
    else
      y ← y － x
    endif
  endwhile
  return x`, { entryCall: 'gcd(12, 18)' });

// ÷ は実数除算、÷ … の商 は整数除算。キャストを間違えると 3.5 と 3 が入れ替わる
pj('実数除算と商・余り', `整数型: a ← 7
整数型: b ← 2
実数型: d ← a ÷ b
整数型: q ← a ÷ b の商
整数型: r ← a ÷ b の余り
d を出力する
q を出力する
r を出力する`);

pj('日本語条件（割り切れる）', `○文字列型: fizzBuzz(整数型: num)
  文字列型: result
  if (num が 3 と 5 で割り切れる)
    result ← "both"
  elseif (num が 3 で割り切れる)
    result ← "three"
  else
    result ← "none"
  endif
  return result`, { entryCall: 'fizzBuzz(15)' });

pj('do-while と mod', `整数型: n ← 10
整数型: c ← 0
do
  if (n mod 2 ＝ 0)
    n ← n ÷ 2 の商
  else
    n ← 3 × n ＋ 1
  endif
  c ← c ＋ 1
while (n ＞ 1)
c を出力する`);

pj('末尾に追加する', `整数型の配列: out ← {}
整数型: i
for (i を 1 から 4 まで 1 ずつ増やす)
  outの末尾 に i × i を追加する
endfor
out[3] を出力する
outの要素数 を出力する`);

pj('大域変数と再帰', `大域: 整数型: count ← 0
○整数型: fib(整数型: n)
  count ← count ＋ 1
  if (n ≦ 1)
    return n
  endif
  return fib(n － 1) ＋ fib(n － 2)`, { entryCall: 'fib(7)' });

pj('文字列の比較と連結', `文字列型: s ← "taro"
if (s ＝ "taro")
  "hello " ＋ s を出力する
endif`);

pj('コンマ区切り出力と減少ループ', `整数型: x ← 1
整数型: y ← 2
整数型: i
for (i を 3 から 1 まで 1 ずつ減らす)
  i を出力する
endfor
x と y をこの順にコンマ区切りで出力する`);

pj('配列が 0 始まりの設定', `整数型の配列: a ← {10, 20, 30}
整数型: s ← 0
整数型: i
for (i を 0 から aの要素数 － 1 まで 1 ずつ増やす)
  s ← s ＋ a[i]
endfor
s を出力する`, { arrayBase: 0 });

pj('ブロックの中の宣言', `整数型: n ← 5
整数型: i
for (i を 1 から n まで 1 ずつ増やす)
  整数型: t ← i × 2
  t を出力する
endfor`);

pj('切り上げと累乗', `実数型: p ← 0.5
整数型: i ← (p × 10) の小数点以下を切り上げた値
i を出力する
整数型: q ← 2 の 5 乗
q を出力する`);

r = (() => { try { return PseudoToJava.convert('整数型: x ← 1\nx が 未定義 を出力する'); } catch (e) { return { err: PseudoToJava.errorMessage(e) }; } })();
ok('P2J エラー 未定義の判定', !!r.err && /未定義/.test(r.err), J(r.err || r.code));

// アプリ内の擬似言語サンプルが Java に変換できること
const pseudoSample = (html.match(/const PSEUDO_SAMPLE_CODE = `([\s\S]*?)`;/) || [])[1];
ok('P2J アプリの擬似言語サンプルが存在', !!pseudoSample);
if (pseudoSample) pj('アプリの擬似言語サンプル', pseudoSample, { entryCall: 'gcd(12, 18)' });

// --- JDK があれば実際にコンパイルして実行する（無ければスキップ） ---
(function javacCheck() {
  const { execFileSync } = require('child_process');
  const os = require('os');
  try { execFileSync('javac', ['-version'], { stdio: 'pipe' }); }
  catch (e) { console.log('SKIP javac が見つからないため Java の実コンパイル検証は省略'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracetable-java-'));
  let compiled = 0;
  for (const c of P2J_CASES) {
    const file = path.join(dir, 'Main.java');
    fs.writeFileSync(file, c.code, 'utf8');
    let out;
    try { execFileSync('javac', ['-encoding', 'UTF-8', '-d', dir, file], { stdio: 'pipe' }); }
    catch (e) { ok('javac ' + c.name, false, String(e.stderr || e.message)); continue; }
    try { out = execFileSync('java', ['-Dfile.encoding=UTF-8', '-cp', dir, 'Main'], { stdio: 'pipe', timeout: 20000 }).toString('utf8'); }
    catch (e) { ok('java 実行 ' + c.name, false, String(e.stderr || e.message)); continue; }
    const lines = out.replace(/\r\n/g, '\n').replace(/\n$/, '');
    const actual = lines === '' ? [] : lines.split('\n');
    ok('javac+実行 ' + c.name, J(normNum(actual)) === J(c.expected), J(normNum(actual)) + ' vs ' + J(c.expected));
    compiled++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`（javac で ${compiled} 件をコンパイル・実行して検証）`);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
