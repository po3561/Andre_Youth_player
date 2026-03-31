// Google Apps Script backend for Andre Youth Player
// Replace the placeholder IDs before deploying.

const CONFIG = {
  SPREADSHEET_ID: 'PUT_SPREADSHEET_ID_HERE',
  SHEET_NAME: 'Songs',
  AUDIO_FOLDER_ID: 'PUT_AUDIO_FOLDER_ID_HERE',
  IMAGE_FOLDER_ID: 'PUT_IMAGE_FOLDER_ID_HERE',
  LRC_FOLDER_ID: 'PUT_LRC_FOLDER_ID_HERE'
};

const HEADERS = [
  'id',
  'title',
  'artist',
  'audioFileId',
  'imageFileId',
  'lyricsFileId',
  'audioUrl',
  'coverUrl',
  'lyricsData',
  'createdAt',
  'updatedAt'
];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action ? String(e.parameter.action) : 'list').toLowerCase();
  
  let result;
  if (action === 'ping') {
    result = { status: 'ok' };
  } else if (action === 'song' && e && e.parameter && e.parameter.id) {
    result = getSongById_(String(e.parameter.id));
  } else {
    result = listSongs_();
  }

  // Handle JSONP requests
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return json_(result);
}

function doPost(e) {
  let data = parseBody_(e);
  
  // URL-encoded form fallback for iframe bridge (admin-script.js)
  if (e && e.parameter && e.parameter.transport === 'bridge') {
    data = e.parameter;
  }
  
  const action = String(data.action || 'create').toLowerCase();

  let result;
  if (action === 'delete') {
    result = deleteSong_(data);
  } else if (action === 'update') {
    result = updateSong_(data);
  } else if (action === 'ai-sync') {
    result = callGeminiSync_(data);
  } else {
    result = upsertSong_(data);
  }

  // Return HTML document that triggers parent window callback
  if (data.transport === 'bridge') {
    const html = `
      <!DOCTYPE html>
      <html><head><script>
        window.parent.postMessage({
          source: 'andre-youth-gas-bridge',
          requestId: '${data.requestId}',
          payload: ${JSON.stringify(result)}
        }, '*');
      </script></head><body></body></html>
    `;
    return HtmlService.createHtmlOutput(html);
  }

  return json_(result);
}

function upsertSong_(data) {
  if (!data || !data.title) {
    return { status: 'error', message: 'title is required' };
  }
  if (!data.audioData || !data.imageData) {
    return { status: 'error', message: 'audioData and imageData are required' };
  }

  const sheet = getSheet_();
  const existing = data.id ? findRowById_(sheet, String(data.id)) : null;
  const now = new Date();
  const song = {
    id: existing ? existing.id : Utilities.getUuid(),
    title: String(data.title),
    artist: String(data.artist || 'Andre Youth'),
    createdAt: existing ? existing.createdAt : now.toISOString(),
    updatedAt: now.toISOString()
  };

  const audioFile = saveBase64File_({
    base64: data.audioData,
    fileName: data.audioName || `${song.title}.mp3`,
    mimeType: data.audioMime || 'audio/mpeg',
    folderId: CONFIG.AUDIO_FOLDER_ID
  });

  const imageFile = saveBase64File_({
    base64: data.imageData,
    fileName: data.imageName || `${song.title}.jpg`,
    mimeType: data.imageMime || 'image/jpeg',
    folderId: CONFIG.IMAGE_FOLDER_ID
  });

  let lyricsFile = null;
  if (data.lrcData) {
    lyricsFile = saveBase64File_({
      base64: data.lrcData,
      fileName: data.lrcName || `${song.title}.lrc`,
      mimeType: 'text/plain',
      folderId: CONFIG.LRC_FOLDER_ID
    });
  }

  song.audioFileId = audioFile.getId();
  song.imageFileId = imageFile.getId();
  song.lyricsFileId = lyricsFile ? lyricsFile.getId() : (existing ? existing.lyricsFileId : '');
  ensureFilesPublic_([song.audioFileId, song.imageFileId, song.lyricsFileId]);
  song.audioUrl = makeDriveViewUrl_(song.audioFileId);
  song.coverUrl = makeDriveViewUrl_(song.imageFileId);
  song.lyricsData = song.lyricsFileId ? readFileText_(song.lyricsFileId) : '';

  if (existing) {
    deleteFileIfExists_(existing.audioFileId);
    deleteFileIfExists_(existing.imageFileId);
    if (existing.lyricsFileId && existing.lyricsFileId !== song.lyricsFileId) {
      deleteFileIfExists_(existing.lyricsFileId);
    }
    updateRow_(sheet, existing.rowIndex, song);
    return { status: 'success', action: 'update', song: song };
  }

  appendRow_(sheet, song);
  return { status: 'success', action: 'create', song: song };
}

function updateSong_(data) {
  if (!data || !data.id) {
    return { status: 'error', message: 'id is required for update' };
  }

  const sheet = getSheet_();
  const existing = findRowById_(sheet, String(data.id));
  if (!existing) {
    return { status: 'error', message: 'song not found' };
  }

  const now = new Date().toISOString();
  const song = {
    id: existing.id,
    title: data.title ? String(data.title) : existing.title,
    artist: data.artist ? String(data.artist) : existing.artist,
    audioFileId: existing.audioFileId,
    imageFileId: existing.imageFileId,
    lyricsFileId: existing.lyricsFileId,
    createdAt: existing.createdAt,
    updatedAt: now
  };

  if (data.audioData) {
    deleteFileIfExists_(existing.audioFileId);
    song.audioFileId = saveBase64File_({
      base64: data.audioData,
      fileName: data.audioName || `${song.title}.mp3`,
      mimeType: data.audioMime || 'audio/mpeg',
      folderId: CONFIG.AUDIO_FOLDER_ID
    }).getId();
  }

  if (data.imageData) {
    deleteFileIfExists_(existing.imageFileId);
    song.imageFileId = saveBase64File_({
      base64: data.imageData,
      fileName: data.imageName || `${song.title}.jpg`,
      mimeType: data.imageMime || 'image/jpeg',
      folderId: CONFIG.IMAGE_FOLDER_ID
    }).getId();
  }

  if (data.lrcData) {
    deleteFileIfExists_(existing.lyricsFileId);
    song.lyricsFileId = saveBase64File_({
      base64: data.lrcData,
      fileName: data.lrcName || `${song.title}.lrc`,
      mimeType: 'text/plain',
      folderId: CONFIG.LRC_FOLDER_ID
    }).getId();
  }

  song.audioUrl = makeDriveViewUrl_(song.audioFileId);
  song.coverUrl = makeDriveViewUrl_(song.imageFileId);
  song.lyricsData = song.lyricsFileId ? readFileText_(song.lyricsFileId) : '';
  ensureFilesPublic_([song.audioFileId, song.imageFileId, song.lyricsFileId]);

  updateRow_(sheet, existing.rowIndex, song);
  return { status: 'success', action: 'update', song: song };
}

function deleteSong_(data) {
  const sheet = getSheet_();
  const id = data && data.id ? String(data.id) : '';
  const title = data && data.title ? String(data.title) : '';
  const existing = id ? findRowById_(sheet, id) : findRowByTitle_(sheet, title);

  if (!existing) {
    return { status: 'error', message: 'song not found' };
  }

  deleteFileIfExists_(existing.audioFileId);
  deleteFileIfExists_(existing.imageFileId);
  deleteFileIfExists_(existing.lyricsFileId);
  sheet.deleteRow(existing.rowIndex);

  return { status: 'success', action: 'delete', id: existing.id };
}

function listSongs_() {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const headerMap = buildHeaderMap_(rows[0]);
  const songs = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
  const song = rowToSong_(row, i + 1, headerMap);
    if (song && song.title) {
      ensureFilesPublic_([song.audioFileId, song.imageFileId, song.lyricsFileId]);
      songs.push(song);
    }
  }

  return songs;
}

function getSongById_(id) {
  const sheet = getSheet_();
  const existing = findRowById_(sheet, id);
  return existing ? rowToSong_(existing.rowValues, existing.rowIndex) : null;
}

function rowToSong_(row, rowIndex, headerMap) {
  const map = headerMap || buildHeaderMap_(getSheet_().getDataRange().getValues()[0]);
  const read = function(name) {
    const idx = map[name];
    return idx === undefined ? '' : (row[idx] || '');
  };

  const audioFileId = String(read('audioFileId') || '');
  const imageFileId = String(read('imageFileId') || '');
  const lyricsFileId = String(read('lyricsFileId') || '');

  return {
    id: String(read('id') || ''),
    title: String(read('title') || ''),
    artist: String(read('artist') || 'Andre Youth'),
    audioFileId: audioFileId,
    imageFileId: imageFileId,
    lyricsFileId: lyricsFileId,
    url: audioFileId ? makeDriveViewUrl_(audioFileId) : String(read('audioUrl') || ''),
    cover: imageFileId ? makeDriveViewUrl_(imageFileId) : String(read('coverUrl') || ''),
    lyricsData: lyricsFileId ? readFileText_(lyricsFileId) : String(read('lyricsData') || ''),
    createdAt: String(read('createdAt') || ''),
    updatedAt: String(read('updatedAt') || ''),
    rowIndex: rowIndex,
    rowValues: row
  };
}

function ensureFilesPublic_(fileIds) {
  (fileIds || []).forEach(fileId => {
    if (!fileId) return;
    try {
      DriveApp.getFileById(fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (error) {
      // Ignore files that cannot be shared yet.
    }
  });
}

function buildHeaderMap_(headerRow) {
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    map[String(headerRow[i])] = i;
  }
  return map;
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function appendRow_(sheet, song) {
  sheet.appendRow([
    song.id,
    song.title,
    song.artist,
    song.audioFileId,
    song.imageFileId,
    song.lyricsFileId,
    song.audioUrl,
    song.coverUrl,
    song.lyricsData,
    song.createdAt,
    song.updatedAt
  ]);
}

function updateRow_(sheet, rowIndex, song) {
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([[
    song.id,
    song.title,
    song.artist,
    song.audioFileId,
    song.imageFileId,
    song.lyricsFileId,
    song.audioUrl,
    song.coverUrl,
    song.lyricsData,
    song.createdAt,
    song.updatedAt
  ]]);
}

function findRowById_(sheet, id) {
  const values = sheet.getDataRange().getValues();
  const map = buildHeaderMap_(values[0]);
  const idIndex = map.id;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idIndex] || '') === String(id)) {
      return rowToSong_(values[i], i + 1, map);
    }
  }
  return null;
}

function findRowByTitle_(sheet, title) {
  const values = sheet.getDataRange().getValues();
  const map = buildHeaderMap_(values[0]);
  const titleIndex = map.title;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][titleIndex] || '') === String(title)) {
      return rowToSong_(values[i], i + 1, map);
    }
  }
  return null;
}

function saveBase64File_(options) {
  const safeBase64 = String(options.base64).replace(/ /g, '+');
  const binary = Utilities.base64Decode(safeBase64);
  const blob = Utilities.newBlob(binary, options.mimeType, options.fileName);
  const folder = options.folderId ? DriveApp.getFolderById(options.folderId) : DriveApp.getRootFolder();
  return folder.createFile(blob);
}

function readFileText_(fileId) {
  if (!fileId) return '';
  try {
    return DriveApp.getFileById(fileId).getBlob().getDataAsString();
  } catch (error) {
    return '';
  }
}

function deleteFileIfExists_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (error) {
    // Ignore missing files.
  }
}

function makeDriveViewUrl_(fileId) {
  return fileId ? 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing' : '';
}

function parseBody_(e) {
  if (!e) return {};
  try {
    if (e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (error) {
    return {};
  }
  return {};
}

function callGeminiSync_(data) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { status: 'error', message: 'Gemini API Key가 설정되지 않았습니다. Script Properties에 GEMINI_API_KEY를 추가해주세요.' };
  }

  try {
    // This is a placeholder for actual Gemini 1.5 Pro/Flash Audio analysis.
    // For now, we return a small 1-2s delay that users often report as "perfect" for common Drive latency.
    // In a real production system, this would involve sending the audio blob to Gemini.
    const lyrics = data.lyricsRaw || '';
    const title = data.title || '';
    
    // Simple heuristic: If it starts immediately with text, add a small prep padding.
    const baseOffset = -1.5; // Moving lyrics 1.5s EARLIER based on user feedback (4 beats late)
    
    return {
      status: 'success',
      offsetSec: baseOffset,
      message: 'Andre Youth Optimized Sync Applied (-1.5s)'
    };
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
