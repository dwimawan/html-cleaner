/*
 * htmlCleaner.js - shared HTML stripping utility
 *
 * Works both in the browser (as global `HTMLRemover`) and in Node
 * (via CommonJS `module.exports`). Pure string implementation so the
 * behaviour is identical everywhere and easy to unit-test.
 *
 * Usage:
 *   cleanHtml(input, { brMode: 'space'|'newline', normalizeWhitespace: bool })
 *
 * Returns the input with all HTML tags removed and entities decoded.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HTMLRemover = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Tags that imply a visual line/block break. Before stripping, these are
  // replaced with a sentinel so the resulting text keeps some structure.
  var BLOCK_TAGS = /<\s*\/(?:p|div|li|tr|h[1-6]|ul|ol|table|section|article|br|blockquote)[^>]*>/gi;
  var BREAK_TAG = /<\s*(?:br|hr)[^>]*\/?\s*>/gi;

  // Simple HTML entity decode table (covers the most common ones).
  var NAMED = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    copy: '(c)',
    reg: '(r)',
    trade: '(tm)',
    bull: '•',
    middot: '·',
    hellip: '…',
    ndash: '–',
    mdash: '—',
    lsquo: '\u2018',
    rsquo: '\u2019',
    ldquo: '\u201c',
    rdquo: '\u201d',
    euro: '\u20ac',
    pound: '\u00a3',
    yen: '\u00a5',
    cent: '\u00a2',
    sect: '\u00a7',
    para: '\u00b6',
    deg: '\u00b0',
    plusmn: '\u00b1',
    times: '\u00d7',
    divide: '\u00f7'
  };

  function decodeEntities(str) {
    return str.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (m, entity) {
      var low = entity.toLowerCase();
      if (low.charAt(0) === '#') {
        var hex = low.charAt(1) === 'x';
        var code = parseInt(hex ? low.slice(2) : low.slice(1), hex ? 16 : 10);
        if (!isNaN(code)) {
          if (code === 0) return '';
          if (code > 0xffff) {
            code -= 0x10000;
            return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
          }
          return String.fromCharCode(code);
        }
        return m;
      }
      return Object.prototype.hasOwnProperty.call(NAMED, low) ? NAMED[low] : m;
    });
  }

  function normalizeWhitespace(str) {
    return str.replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n');
  }

  /**
   * Remove HTML tags and decode entities from a string.
   *
   * @param {string} input  Raw cell value (may contain HTML).
   * @param {object} [options]
   * @param {string} [options.brMode='newline'] How to render line breaks:
   *   'newline' -> <br> and block tags become a newline character (preserves
   *              paragraph/enter breaks, default);
   *   'space' -> they become a single space (safe to paste into Excel as a
   *              single cell).
   * @param {boolean} [options.normalizeWhitespace=true] Collapse runs of
   *   whitespace into a single space.
   * @returns {string} Cleaned plain text.
   */
  function cleanHtml(input, options) {
    if (input == null) return '';
    var str = String(input);
    if (!str) return str;

    options = options || {};
    // Preserve line breaks by default; 'space' collapses them for Excel-paste safety.
    var brMode = options.brMode === 'space' ? ' ' : '\n';
    var norm = options.normalizeWhitespace !== false;

    // 1. Block-level closing tags -> separator (brMode).
    str = str.replace(BLOCK_TAGS, brMode);
    // 2. Self-closing <br>/<hr> -> separator.
    str = str.replace(BREAK_TAG, brMode);
    // 3. Remove all remaining tags (and tag-like artifacts).
    str = str.replace(/<[^>]*>/g, '');
    // 4. Decode entities.
    str = decodeEntities(str);
    // 5. Normalize whitespace.
    if (norm) str = normalizeWhitespace(str);
    // 6. Trim leading/trailing whitespace (structural separators at edges).
    return str.trim();
  }

  /**
   * Clean an entire 2D array (array of rows, each row an array of cells).
   * Returns a new array of the same shape with each cell cleaned.
   */
  function cleanGrid(grid, options) {
    var out = [];
    if (!grid) return out;
    for (var r = 0; r < grid.length; r++) {
      var row = grid[r];
      var newRow = [];
      if (row && row.length) {
        for (var c = 0; c < row.length; c++) {
          newRow.push(cleanHtml(row[c], options));
        }
      }
      out.push(newRow);
    }
    return out;
  }

  return {
    cleanHtml: cleanHtml,
    cleanGrid: cleanGrid,
    decodeEntities: decodeEntities
  };
});
