/*
 * server/htmlCleaner.js
 * Re-exports the shared HTML cleaner for server-side use (CommonJS).
 * The canonical implementation lives in public/htmlCleaner.js (UMD) so the
 * browser and the server behave identically.
 */
'use strict';

var path = require('path');
module.exports = require(path.join(__dirname, '..', 'public', 'htmlCleaner.js'));
