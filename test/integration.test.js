/*
 * Integration tests: server endpoints + file parsing.
 * Uses Node's built-in http module (no extra deps), Node >= 14 compatible.
 *
 * Usage: node test/integration.test.js
 */
'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');

var server = require('../server/index.js');
var parseBufferToGrid = server.parseBufferToGrid;

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

console.log('integration.test.js');

var FIX = path.join(__dirname, 'fixtures');

// ---- parseBufferToGrid ------------------------------------------------------
test('parses TSV', function () {
  var buf = fs.readFileSync(path.join(FIX, 'sample.tsv'));
  var grid = parseBufferToGrid(buf, 'sample.tsv');
  assert.strictEqual(grid[0][0], 'Nama');
  assert.strictEqual(grid[1][1], '<p>Halo &amp; selamat<br>datang</p>');
});

test('parses CSV', function () {
  var buf = fs.readFileSync(path.join(FIX, 'sample.csv'));
  var grid = parseBufferToGrid(buf, 'sample.csv');
  assert.strictEqual(grid[1][1], '<p>Halo &amp; selamat</p>');
});

test('parses XLSX', function () {
  var buf = fs.readFileSync(path.join(FIX, 'sample.xlsx'));
  var grid = parseBufferToGrid(buf, 'sample.xlsx');
  assert.strictEqual(grid[1][0], '<b>Andi</b>');
});

// ---- HTTP endpoints ---------------------------------------------------------
function request(app, method, reqPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var srv = app.listen(0, function () {
      var port = srv.address().port;
      var opts = {
        host: '127.0.0.1',
        port: port,
        path: reqPath,
        method: method,
        headers: headers || {}
      };
      var req = http.request(opts, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          srv.close();
          var text = Buffer.concat(chunks).toString('utf8');
          var json = null;
          try { json = JSON.parse(text); } catch (e) {}
          resolve({ status: res.statusCode, json: json, text: text });
        });
      });
      req.on('error', function (e) { srv.close(); reject(e); });
      if (body) req.write(body);
      req.end();
    });
  });
}

function multipartBody(fields, filename) {
  var boundary = '----rtkTestBoundary' + Date.now();
  var body = [];
  Object.keys(fields).forEach(function (k) {
    body.push('--' + boundary);
    body.push('Content-Disposition: form-data; name="' + k + '"');
    body.push('');
    body.push(fields[k]);
  });
  var buf = fs.readFileSync(path.join(FIX, filename));
  body.push('--' + boundary);
  body.push('Content-Disposition: form-data; name="file"; filename="' + filename + '"');
  body.push('Content-Type: application/octet-stream');
  body.push('');
  var head = Buffer.from(body.join('\r\n') + '\r\n', 'utf8');
  var tail = Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8');
  return { boundary: boundary, body: Buffer.concat([head, buf, tail]) };
}

test('GET /api/health returns ok', async function () {
  var app = server.createApp();
  var res = await request(app, 'GET', '/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.ok, true);
});

test('GET /vendor/papaparse.min.js serves PapaParse', async function () {
  var app = server.createApp();
  var res = await request(app, 'GET', '/vendor/papaparse.min.js');
  assert.strictEqual(res.status, 200);
  assert.ok(res.text.indexOf('Papa') !== -1, 'body should contain PapaParse');
});

test('GET /vendor/xlsx.full.min.js serves SheetJS', async function () {
  var app = server.createApp();
  var res = await request(app, 'GET', '/vendor/xlsx.full.min.js');
  assert.strictEqual(res.status, 200);
  assert.ok(res.text.length > 1000, 'body should be the SheetJS bundle');
});

test('POST /api/clean with TSV upload', async function () {
  var app = server.createApp();
  var mp = multipartBody({ brMode: 'space', normalizeWhitespace: 'true' }, 'sample.tsv');
  var res = await request(app, 'POST', '/api/clean', mp.body, {
    'Content-Type': 'multipart/form-data; boundary=' + mp.boundary
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.json.ok);
  // row 2 col 2: <p>Halo &amp; selamat<br>datang</p> -> 'Halo & selamat datang'
  assert.strictEqual(res.json.grid[1][1], 'Halo & selamat datang');
});

test('POST /api/clean with XLSX upload (default newline)', async function () {
  var app = server.createApp();
  var mp = multipartBody({}, 'sample.xlsx');
  var res = await request(app, 'POST', '/api/clean', mp.body, {
    'Content-Type': 'multipart/form-data; boundary=' + mp.boundary
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.grid[1][0], 'Andi');
  // default brMode preserves line breaks
  assert.strictEqual(res.json.grid[1][1], 'Halo & selamat\ndatang');
});

test('POST /api/clean with XLSX upload (space mode)', async function () {
  var app = server.createApp();
  var mp = multipartBody({ brMode: 'space' }, 'sample.xlsx');
  var res = await request(app, 'POST', '/api/clean', mp.body, {
    'Content-Type': 'multipart/form-data; boundary=' + mp.boundary
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.grid[1][1], 'Halo & selamat datang');
});

test('POST /api/clean without file returns 400', async function () {
  var app = server.createApp();
  var res = await request(app, 'POST', '/api/clean', 'x=1', {
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  assert.strictEqual(res.status, 400);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
