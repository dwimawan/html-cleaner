/*
 * Dependency-free unit tests for the shared HTML cleaner.
 * Runs on any Node >= 12 (no external test framework needed).
 *
 * Usage: node test/htmlCleaner.test.js
 */
'use strict';

var assert = require('assert');
var cleaner = require('../server/htmlCleaner.js');
var cleanHtml = cleaner.cleanHtml;
var cleanGrid = cleaner.cleanGrid;

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL ' + name);
    console.error('       ' + (e && e.message));
  }
}

console.log('htmlCleaner.test.js');

test('strips simple tags', function () {
  assert.strictEqual(cleanHtml('<b>bold</b>'), 'bold');
});

test('strips nested tags (inline spans stay joined)', function () {
  assert.strictEqual(cleanHtml('<div><span>a</span><span>b</span></div>'), 'ab');
  assert.strictEqual(cleanHtml('<div><span>a</span> <span>b</span></div>'), 'a b');
});

test('decodes named entities', function () {
  assert.strictEqual(cleanHtml('Tom &amp; Jerry'), 'Tom & Jerry');
  assert.strictEqual(cleanHtml('a&nbsp;b'), 'a b');
  assert.strictEqual(cleanHtml('&lt;tag&gt;'), '<tag>');
});

test('decodes numeric entities', function () {
  assert.strictEqual(cleanHtml('&#65; &#x42;'), 'A B');
});

test('br -> newline by default', function () {
  assert.strictEqual(cleanHtml('line1<br>line2'), 'line1\nline2');
});

test('br -> newline mode', function () {
  assert.strictEqual(cleanHtml('line1<br>line2', { brMode: 'newline' }), 'line1\nline2');
});

test('br -> space when space mode', function () {
  assert.strictEqual(cleanHtml('line1<br>line2', { brMode: 'space' }), 'line1 line2');
});

test('block tags become newline by default', function () {
  assert.strictEqual(cleanHtml('<p>one</p><p>two</p>'), 'one\ntwo');
});

test('block tags become newline in newline mode', function () {
  assert.strictEqual(cleanHtml('<p>one</p><p>two</p>', { brMode: 'newline' }), 'one\ntwo');
});

test('block tags become space in space mode', function () {
  assert.strictEqual(cleanHtml('<p>one</p><p>two</p>', { brMode: 'space' }), 'one two');
});

test('normalizes whitespace by default', function () {
  assert.strictEqual(cleanHtml('a    b   c'), 'a b c');
});

test('normalizeWhitespace can be disabled', function () {
  assert.strictEqual(cleanHtml('a    b', { normalizeWhitespace: false }), 'a    b');
});

test('handles null and undefined', function () {
  assert.strictEqual(cleanHtml(null), '');
  assert.strictEqual(cleanHtml(undefined), '');
});

test('handles non-string input (numbers)', function () {
  assert.strictEqual(cleanHtml(123), '123');
});

test('handles empty string', function () {
  assert.strictEqual(cleanHtml(''), '');
});

test('decodes entities after stripping (attribute-only html)', function () {
  assert.strictEqual(cleanHtml('<a href="#">Link</a>'), 'Link');
});

test('cleanGrid cleans every cell', function () {
  var grid = [
    ['<b>Name</b>', '<p>Desc</p>'],
    ['A &amp; B', 'plain']
  ];
  var out = cleanGrid(grid);
  assert.deepStrictEqual(out, [
    ['Name', 'Desc'],
    ['A & B', 'plain']
  ]);
});

test('cleanGrid returns empty for null grid', function () {
  assert.deepStrictEqual(cleanGrid(null), []);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
