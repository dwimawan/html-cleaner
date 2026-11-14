/*
 * server/index.js
 * Express static file server + POST /api/clean fallback endpoint
 * for large files that are too heavy to process in the browser.
 *
 * Env vars:
 *   PORT          - listen port (default 3000)
 *   MAX_FILE_MB   - max upload size in MB (default 50)
 */
'use strict';

var path = require('path');
var express = require('express');
var multer = require('multer');
var XLSX = require('xlsx');
var Papa = require('papaparse');
var cleaner = require('./htmlCleaner.js');

var PORT = parseInt(process.env.PORT, 10) || 3000;
var MAX_MB = parseInt(process.env.MAX_FILE_MB, 10) || 50;

function createApp() {
  var app = express();

  // ---- Static frontend -------------------------------------------------------
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: 'index.html'
  }));

  // ---- Vendor libraries ------------------------------------------------------
  // Served straight from node_modules so `npm start` works without the manual
  // copy step that deploy/deploy.sh performs. public/vendor still wins if present.
  app.get('/vendor/papaparse.min.js', function (req, res) {
    sendVendor(res, path.join(__dirname, '..', 'node_modules', 'papaparse', 'papaparse.min.js'));
  });
  app.get('/vendor/xlsx.full.min.js', function (req, res) {
    sendVendor(res, path.join(__dirname, '..', 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'));
  });

  // ---- Upload parsing --------------------------------------------------------
  var upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_MB * 1024 * 1024 }
  });

  app.post('/api/clean', function (req, res) {
    upload.single('file')(req, res, function (err) {
      if (err) {
        var status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Field name must be "file".' });
      }

      try {
        var grid = parseBufferToGrid(req.file.buffer, req.file.originalname);
        var cleanedGrid = cleaner.cleanGrid(grid, {
          brMode: req.body.brMode === 'space' ? 'space' : 'newline',
          normalizeWhitespace: req.body.normalizeWhitespace !== 'false'
        });
        res.json({ ok: true, grid: cleanedGrid });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse file: ' + e.message });
      }
    });
  });

  // ---- Health check ----------------------------------------------------------
  app.get('/api/health', function (req, res) {
    res.json({ ok: true, name: 'html-remover', node: process.version });
  });

  return app;
}

function sendVendor(res, filePath) {
  res.sendFile(filePath, function (err) {
    if (!err) return;
    if (res.headersSent) return res.end();
    res.status(404).type('text/plain').send(
      'Vendor file tidak ditemukan: ' + path.basename(filePath) + '. Jalankan `npm install` dulu.'
    );
  });
}

function parseBufferToGrid(buffer, filename) {
  var ext = (filename || '').toLowerCase().split('.').pop();
  var grid;

  if (ext === 'csv' || ext === 'tsv') {
    var text = buffer.toString('utf8');
    var result = Papa.parse(text, { skipEmptyLines: true });
    grid = result.data || [];
  } else {
    // xlsx / xls
    var wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    var firstSheet = wb.SheetNames[0];
    if (!firstSheet) grid = [];
    else grid = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
      header: 1,
      raw: false,
      defval: ''
    });
  }

  // Normalise: strip empty trailing rows and ensure every cell is a string.
  var cleaned = [];
  for (var r = 0; r < grid.length; r++) {
    var row = grid[r];
    var hasContent = false;
    var newRow = [];
    for (var c = 0; c < row.length; c++) {
      var v = row[c];
      if (v == null) v = '';
      v = String(v);
      if (v.length > 0) hasContent = true;
      newRow.push(v);
    }
    if (hasContent) cleaned.push(newRow);
  }
  return cleaned;
}

module.exports = {
  createApp: createApp,
  parseBufferToGrid: parseBufferToGrid
};

if (require.main === module) {
  var app = createApp();
  app.listen(PORT, function () {
    console.log('html-remover listening on port ' + PORT + ' (max upload ' + MAX_MB + ' MB)');
  });
}
