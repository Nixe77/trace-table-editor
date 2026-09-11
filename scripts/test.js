// 依存なしの回帰テスト:  node scripts/test.js
// 1) index.html 内の <script> を構文チェック
// 2) 擬似言語インタプリタ（PseudoLang）を取り出して IPA サンプル問題で結果を検証
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
ok('scripts: 2 blocks (PseudoLang + app)', scripts.length === 2, 'found ' + scripts.length);

// 2) PseudoLang を取り出す
const plSrc = scripts.find(s => s.includes('const PseudoLang = (() => {'));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(plSrc + '\nthis.PseudoLang = PseudoLang;', sandbox);
const PseudoLang = sandbox.PseudoLang;

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
