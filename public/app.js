/*
 * public/app.js
 * Frontend logic for HTML Remover.
 *
 * Flow: input (paste/upload) -> parse -> preview + select columns -> copy TSV
 */
(function () {
  'use strict';

  var cleaner = window.HTMLRemover;
  var CLIENT_MAX_MB = 10; // files up to this size are parsed in-browser
  var PREVIEW_ROWS = 100;
  var MAX_FILE_MB = 50;

  var state = {
    grid: null,        // 2D array of strings (rows of cells), raw values
    cleaned: null,     // cleaned grid (same shape)
    selectedCols: {},  // index -> true
    columns: 0,
    source: ''         // 'paste' | 'file' | 'server'
  };

  var el = {};
  function $(id) { return document.getElementById(id); }

  document.addEventListener('DOMContentLoaded', function () {
    Object.keys({
      tabPaste: 'tabPaste', tabUpload: 'tabUpload',
      panelPaste: 'panelPaste', panelUpload: 'panelUpload',
      pasteArea: 'pasteArea', fileInput: 'fileInput', browseBtn: 'browseBtn',
      dropzone: 'dropzone', fileInfo: 'fileInfo', delimiter: 'delimiter',
      parseBtn: 'parseBtn', parseStatus: 'parseStatus',
      previewSection: 'previewSection', outputSection: 'outputSection',
      previewTable: 'previewTable', gridInfo: 'gridInfo',
      selectAllBtn: 'selectAllBtn', selectNoneBtn: 'selectNoneBtn',
      brMode: 'brMode', normalizeWs: 'normalizeWs',
      copyBtn: 'copyBtn', copyStatus: 'copyStatus', copyHint: 'copyHint',
      cleanMoreBtn: 'cleanMoreBtn', cleanMoreWrap: 'cleanMoreWrap'
    }).forEach(function (id) { el[id] = $(id); });

    wireEvents();
    updateParseButton();
  });

  function wireEvents() {
    el.tabPaste.addEventListener('click', function () { switchTab('paste'); });
    el.tabUpload.addEventListener('click', function () { switchTab('upload'); });

    el.pasteArea.addEventListener('input', updateParseButton);
    el.delimiter.addEventListener('change', updateParseButton);

    el.browseBtn.addEventListener('click', function () { el.fileInput.click(); });
    el.fileInput.addEventListener('change', onFilePicked);

    el.dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      el.dropzone.classList.add('dropzone--over');
    });
    el.dropzone.addEventListener('dragleave', function () {
      el.dropzone.classList.remove('dropzone--over');
    });
    el.dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      el.dropzone.classList.remove('dropzone--over');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    el.parseBtn.addEventListener('click', onParse);
    el.selectAllBtn.addEventListener('click', function () { setAllCols(true); });
    el.selectNoneBtn.addEventListener('click', function () { setAllCols(false); });
    el.copyBtn.addEventListener('click', onCopy);
    el.cleanMoreBtn.addEventListener('click', resetApp);
  }

  function switchTab(tab) {
    el.tabPaste.classList.toggle('tab--active', tab === 'paste');
    el.tabUpload.classList.toggle('tab--active', tab === 'upload');
    el.panelPaste.classList.toggle('tab-panel--hidden', tab !== 'paste');
    el.panelUpload.classList.toggle('tab-panel--hidden', tab !== 'upload');
    updateParseButton();
  }

  function updateParseButton() {
    var tabActive = el.tabPaste.classList.contains('tab--active');
    var hasInput = tabActive
      ? el.pasteArea.value.trim().length > 0
      : !!state.pickedFile;
    el.parseBtn.disabled = !hasInput;
  }

  function onFilePicked(e) {
    if (e.target.files && e.target.files.length) handleFile(e.target.files[0]);
  }

  function handleFile(file) {
    if (!file) return;
    state.pickedFile = file;
    el.fileInfo.textContent = file.name + ' (' + formatSize(file.size) + ')';
    el.parseBtn.disabled = false;
    setStatus('parseStatus', '');
  }

  // ---- Parse -----------------------------------------------------------------

  function onParse() {
    setStatus('parseStatus', '');
    var tabActive = el.tabPaste.classList.contains('tab--active');

    if (tabActive) {
      var text = el.pasteArea.value;
      try {
        state.grid = parsePastedText(text);
      } catch (e) {
        return setStatus('parseStatus', 'Gagal parse teks: ' + e.message, true);
      }
      state.source = 'paste';
      finishParse();
    } else {
      if (!state.pickedFile) {
        return setStatus('parseStatus', 'Pilih file terlebih dahulu.', true);
      }
      parseFile(state.pickedFile);
    }
  }

  function parsePastedText(text) {
    var delim = el.delimiter.value;
    var options = { skipEmptyLines: true };
    if (delim !== 'auto') options.delimiter = delim;
    var result = Papa.parse(text, options);
    if (result.errors && result.errors.length) {
      // auto-detect errors may occur; if we used auto, try tab then comma
      if (delim === 'auto') {
        var r2 = Papa.parse(text, { skipEmptyLines: true, delimiter: '\t' });
        if (r2.errors && r2.errors.length === 0 && r2.data && r2.data.length) {
          return toStringGrid(r2.data);
        }
      }
    }
    return toStringGrid(result.data || []);
  }

  function toStringGrid(data) {
    var out = [];
    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var newRow = [];
      for (var c = 0; c < row.length; c++) {
        var v = row[c];
        newRow.push(v == null ? '' : String(v));
      }
      if (newRow.some(function (x) { return x.length > 0; })) out.push(newRow);
    }
    return out;
  }

  function parseFile(file) {
    var isServer = file.size > CLIENT_MAX_MB * 1024 * 1024;
    if (isServer) return parseFileOnServer(file);
    parseFileInBrowser(file);
  }

  function parseFileInBrowser(file) {
    setStatus('parseStatus', 'Parsing file di browser...');
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = reader.result;
        var name = file.name.toLowerCase();
        var grid;
        if (/\.(csv|tsv)$/.test(name)) {
          grid = Papa.parse(new TextDecoder().decode(data), { skipEmptyLines: true }).data;
        } else {
          var wb = XLSX.read(data, { type: 'array', cellDates: false });
          var sheet = wb.SheetNames[0];
          grid = sheet ? XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: '' }) : [];
        }
        state.grid = toStringGrid(grid);
        state.source = 'file';
        finishParse();
      } catch (e) {
        setStatus('parseStatus', 'Gagal parse file di browser: ' + e.message, true);
      }
    };
    reader.onerror = function () {
      setStatus('parseStatus', 'Gagal membaca file.', true);
    };
    if (/\.(csv|tsv)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsArrayBuffer(file);
  }

  function parseFileOnServer(file) {
    setStatus('parseStatus', 'Mengirim ke server untuk diproses (file besar)...');
    var fd = new FormData();
    fd.append('file', file);
    fd.append('brMode', el.brMode.value);
    fd.append('normalizeWhitespace', el.normalizeWs.checked ? 'true' : 'false');
    fetch('/api/clean', { method: 'POST', body: fd })
      .then(function (resp) { return resp.json().then(function (j) { return { ok: resp.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error) || 'Server error');
        state.grid = res.j.grid || [];
        state.source = 'server';
        finishParse();
      })
      .catch(function (e) {
        setStatus('parseStatus', 'Server: ' + e.message, true);
      });
  }

  // ---- Post-parse -------------------------------------------------------------

  function finishParse() {
    if (!state.grid.length) {
      return setStatus('parseStatus', 'Tidak ada data yang ditemukan.', true);
    }
    state.columns = 0;
    for (var r = 0; r < state.grid.length; r++) {
      if (state.grid[r].length > state.columns) state.columns = state.grid[r].length;
    }
    if (state.columns === 0) {
      return setStatus('parseStatus', 'Data kosong.', true);
    }

    // Build cleaned grid once.
    state.cleaned = cleaner.cleanGrid(state.grid, {
      brMode: el.brMode.value,
      normalizeWhitespace: el.normalizeWs.checked
    });

    // Select all columns by default.
    setAllCols(true);

    renderPreview();
    el.previewSection.hidden = false;
    el.outputSection.hidden = false;
    setStatus('parseStatus', 'Data siap (' + state.grid.length + ' baris x ' + state.columns + ' kolom).');
    el.previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setAllCols(selected) {
    state.selectedCols = {};
    for (var c = 0; c < state.columns; c++) {
      if (selected) state.selectedCols[c] = true;
    }
    // Update checkboxes if table rendered
    var boxes = el.previewTable.querySelectorAll('thead .col-check input');
    for (var i = 0; i < boxes.length; i++) boxes[i].checked = selected;
    updateGridInfo();
  }

  function renderPreview() {
    var rows = Math.min(state.grid.length, PREVIEW_ROWS);
    var thead = el.previewTable.tHead || el.previewTable.createTHead();
    var tbody = el.previewTable.tBodies[0] || el.previewTable.createTBody();
    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Header row: checkbox per column
    var hr = document.createElement('tr');
    for (var c = 0; c < state.columns; c++) {
      var th = document.createElement('th');
      var label = document.createElement('label');
      label.className = 'col-check';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!state.selectedCols[c];
      cb.dataset.col = c;
      cb.addEventListener('change', function () {
        state.selectedCols[+this.dataset.col] = this.checked;
        updateGridInfo();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode('Kolom ' + (c + 1)));
      th.appendChild(label);
      th.appendChild(document.createTextNode(colHeaderValue(c)));
      hr.appendChild(th);
    }
    thead.appendChild(hr);

    // Body: show raw then cleaned (cleaned shown italic/struck for clarity)
    for (var r = 0; r < rows; r++) {
      var tr = document.createElement('tr');
      for (var c2 = 0; c2 < state.columns; c2++) {
        var td = document.createElement('td');
        var raw = state.grid[r][c2] || '';
        var cleaned = state.cleaned[r][c2] || '';
        if (state.selectedCols[c2] && raw !== cleaned) {
          var old = document.createElement('span');
          old.className = 'cell-old';
          old.textContent = raw;
          var arrow = document.createTextNode(' \u2192 ');
          var neu = document.createElement('span');
          neu.className = 'cell-new';
          neu.textContent = cleaned;
          td.appendChild(old); td.appendChild(arrow); td.appendChild(neu);
        } else {
          td.textContent = cleaned;
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    if (state.grid.length > PREVIEW_ROWS) {
      var note = document.createElement('tr');
      var ntd = document.createElement('td');
      ntd.colSpan = state.columns;
      ntd.textContent = '... dan ' + (state.grid.length - PREVIEW_ROWS) + ' baris lainnya (tidak ditampilkan, tetap ikut di-copy).';
      ntd.style.color = 'var(--muted)';
      note.appendChild(ntd);
      tbody.appendChild(note);
    }

    updateGridInfo();
  }

  function colHeaderValue(c) {
    var first = state.grid[0] && state.grid[0][c];
    if (first && String(first).length <= 20) return String(first);
    return '';
  }

  function updateGridInfo() {
    var count = Object.keys(state.selectedCols).filter(function (k) { return state.selectedCols[k]; }).length;
    if (!el.gridInfo) return;
    el.gridInfo.textContent = state.grid.length + ' baris x ' + state.columns +
      ' kolom \u00b7 dipilih: ' + count + ' kolom';
  }

  // ---- Copy ---------------------------------------------------------------------

  function onCopy() {
    setStatus('copyStatus', 'Menyiapkan data...');
    var lines = [];
    for (var r = 0; r < state.grid.length; r++) {
      var cells = [];
      for (var c = 0; c < state.columns; c++) {
        var isSelected = !!state.selectedCols[c];
        var val = isSelected ? (state.cleaned[r][c] || '') : (state.grid[r][c] || '');
        cells.push(sanitizeForTSV(val));
      }
      lines.push(cells.join('\t'));
    }
    var tsv = lines.join('\n');

    copyToClipboard(tsv).then(function () {
      setStatus('copyStatus', 'Berhasil disalin ke clipboard.');
      el.copyHint.hidden = false;
      el.cleanMoreWrap.hidden = false;
    }).catch(function (e) {
      setStatus('copyStatus', 'Gagal menyalin otomatis: ' + e.message + '. Gunakan tombol cadangan.', true);
      el.copyHint.hidden = false;
      el.cleanMoreWrap.hidden = false;
      fallbackCopy(tsv);
    });
  }

  function resetApp() {
    state.grid = null;
    state.cleaned = null;
    state.selectedCols = {};
    state.columns = 0;
    state.source = '';
    state.pickedFile = null;
    el.pasteArea.value = '';
    el.fileInput.value = '';
    el.fileInfo.textContent = '';
    el.previewSection.hidden = true;
    el.outputSection.hidden = true;
    el.cleanMoreWrap.hidden = true;
    el.copyHint.hidden = false;
    setStatus('copyStatus', '');
    setStatus('parseStatus', '');
    switchTab('paste');
    el.pasteArea.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Replace tab/newline inside a cell so pasting into Excel keeps column structure.
  function sanitizeForTSV(val) {
    if (val.indexOf('\t') === -1 && val.indexOf('\n') === -1 && val.indexOf('\r') === -1) return val;
    // Double-quote per CSV rules: wrap and escape quotes.
    return '"' + val.replace(/"/g, '""') + '"';
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ok = legacyCopy(text);
      if (ok) resolve(); else reject(new Error('clipboard API tidak tersedia'));
    });
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function fallbackCopy(text) {
    // Show raw TSV in a textarea for manual copy if all else fails.
    var existing = document.getElementById('fallbackBox');
    if (existing) existing.remove();
    var box = document.createElement('textarea');
    box.id = 'fallbackBox';
    box.value = text;
    box.style.width = '100%';
    box.style.height = '180px';
    box.style.marginTop = '10px';
    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Salin manual dari kotak di bawah ini:';
    el.copyHint.parentNode.insertBefore(box, el.copyHint.nextSibling);
    box.parentNode.insertBefore(hint, box);
    box.focus();
    box.select();
  }

  // ---- Helpers ------------------------------------------------------------------

  function setStatus(id, msg, isError) {
    var node = $(id);
    if (!node) return;
    node.textContent = msg;
    node.classList.toggle('status--error', !!isError);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
})();
