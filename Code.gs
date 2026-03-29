// Google Apps Script backend for Andre Youth Player
// Paste this whole file into Code.gs in Apps Script.

const CONFIG = {
  SPREADSHEET_ID: 'PUT_SPREADSHEET_ID_HERE',
  SHEET_NAME: 'Songs',
  AUDIO_FOLDER_ID: 'PUT_AUDIO_FOLDER_ID_HERE',
  IMAGE_FOLDER_ID: 'PUT_IMAGE_FOLDER_ID_HERE',
  LRC_FOLDER_ID: 'PUT_LRC_FOLDER_ID_HERE'
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_MAX_INLINE_BYTES = 18 * 1024 * 1024;

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
  try {
    const action = String(getParam_(e, 'action', 'list')).toLowerCase();

    if (action === 'ping') {
      return json_({
        status: 'ok',
        ts: new Date().toISOString()
      });
    }

    if (action === 'song') {
      const id = getParam_(e, 'id', '');
      if (id) {
        return json_(getSongById_(String(id)));
      }
    }

    return json_(listSongs_());
  } catch (error) {
    return json_(errorPayload_(error));
  }
}

function doPost(e) {
  try {
    const data = parseBody_(e);
    const action = String(data.action || 'create').toLowerCase();

    if (action === 'delete') {
      return json_(deleteSong_(data));
    }

    if (action === 'update') {
      return json_(updateSong_(data));
    }

    if (action === 'ai-sync' || action === 'aisync' || action === 'analyze-lyrics') {
      return json_(analyzeLyricsWithGemini_(data));
    }

    return json_(upsertSong_(data));
  } catch (error) {
    return json_(errorPayload_(error));
  }
}

function upsertSong_(data) {
  return saveSong_(data, false);
}

function updateSong_(data) {
  return saveSong_(data, true);
}

function saveSong_(data, requireExisting) {
  if (!data) {
    return { status: 'error', message: 'payload is required' };
  }

  const sheet = getSheet_();
  const existing = data.id ? findRowById_(sheet, String(data.id)) : null;

  if (requireExisting && !existing) {
    return { status: 'error', message: 'song not found' };
  }

  const title = text_(data.title || (existing && existing.title) || '').trim();
  if (!title) {
    return { status: 'error', message: 'title is required' };
  }

  const artist = text_(data.artist || (existing && existing.artist) || 'Andre Youth').trim() || 'Andre Youth';
  const nowIso = new Date().toISOString();
  const isUpdate = !!existing;

  const audioSource = text_(data.audioData || '');
  const imageSource = text_(data.imageData || data.coverData || data.profileData || '');
  const lyricsSource = text_(data.lrcData || data.lyricsData || '');

  if (!isUpdate && (!audioSource || !imageSource)) {
    return { status: 'error', message: 'audioData and imageData are required' };
  }

  const previous = existing ? serializeSong_(existing) : null;
  const song = normalizeSong_({
    id: isUpdate ? existing.id : Utilities.getUuid(),
    title: title,
    artist: artist,
    createdAt: isUpdate ? existing.createdAt : nowIso,
    updatedAt: nowIso
  });

  let nextAudioFileId = isUpdate ? existing.audioFileId : '';
  let nextImageFileId = isUpdate ? existing.imageFileId : '';
  let nextLyricsFileId = isUpdate ? existing.lyricsFileId : '';

  if (audioSource) {
    nextAudioFileId = saveBase64File_({
      base64: audioSource,
      fileName: data.audioName || `${title}.mp3`,
      mimeType: data.audioMime || 'audio/mpeg',
      folderId: CONFIG.AUDIO_FOLDER_ID
    }).getId();
  }

  if (imageSource) {
    nextImageFileId = saveBase64File_({
      base64: imageSource,
      fileName: data.imageName || data.coverName || data.profileName || `${title}.jpg`,
      mimeType: data.imageMime || data.coverMime || data.profileMime || 'image/jpeg',
      folderId: CONFIG.IMAGE_FOLDER_ID
    }).getId();
  }

  if (lyricsSource) {
    nextLyricsFileId = saveBase64File_({
      base64: lyricsSource,
      fileName: data.lrcName || data.lyricsName || `${title}.lrc`,
      mimeType: data.lrcMime || data.lyricsMime || 'text/plain',
      folderId: CONFIG.LRC_FOLDER_ID
    }).getId();
  }

  if (!nextAudioFileId || !nextImageFileId) {
    return { status: 'error', message: 'audioData and imageData are required' };
  }

  song.audioFileId = nextAudioFileId;
  song.imageFileId = nextImageFileId;
  song.lyricsFileId = nextLyricsFileId;
  song.audioUrl = makeDriveViewUrl_(nextAudioFileId);
  song.coverUrl = makeDriveViewUrl_(nextImageFileId);
  song.profileUrl = song.coverUrl;
  song.url = song.audioUrl;
  song.cover = song.coverUrl;
  song.profile = song.profileUrl;
  song.lyricsData = nextLyricsFileId ? readFileText_(nextLyricsFileId) : '';

  ensureFilesPublic_([song.audioFileId, song.imageFileId, song.lyricsFileId]);

  if (isUpdate) {
    updateRow_(sheet, existing.rowIndex, song);

    if (previous && previous.audioFileId && previous.audioFileId !== song.audioFileId) {
      deleteFileIfExists_(previous.audioFileId);
    }
    if (previous && previous.imageFileId && previous.imageFileId !== song.imageFileId) {
      deleteFileIfExists_(previous.imageFileId);
    }
    if (previous && previous.lyricsFileId && previous.lyricsFileId !== song.lyricsFileId) {
      deleteFileIfExists_(previous.lyricsFileId);
    }

    return { status: 'success', action: 'update', song: serializeSong_(song) };
  }

  appendRow_(sheet, song);
  return { status: 'success', action: 'create', song: serializeSong_(song) };
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

function analyzeLyricsWithGemini_(data) {
  const apiKey = getGeminiApiKey_();
  if (!apiKey) {
    return {
      status: 'error',
      message: 'GEMINI_API_KEY is not configured in Script Properties'
    };
  }

  const rawLyrics = text_(data && (data.lyricsRaw || data.lyrics || data.rawText || data.lrcText || '')).trim();
  if (!rawLyrics) {
    return { status: 'error', message: 'lyricsRaw is required' };
  }

  const audioData = sanitizeBase64_(data && (data.audioData || data.audioBase64 || ''));
  if (!audioData) {
    return { status: 'error', message: 'audioData is required' };
  }

  if (estimateBase64Size_(audioData) > GEMINI_MAX_INLINE_BYTES) {
    return {
      status: 'error',
      message: 'audioData is too large for inline Gemini analysis'
    };
  }

  const mimeType = normalizeMimeType_(data && (data.audioMime || data.mimeType || 'audio/mpeg'));
  const title = text_(data && data.title || '');
  const artist = text_(data && data.artist || 'Andre Youth');
  const prompt = buildGeminiOffsetPrompt_(rawLyrics, title, artist);

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: audioData
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          offsetSec: { type: 'number' },
          confidence: { type: 'number' },
          rationale: { type: 'string' }
        },
        required: ['offsetSec', 'confidence', 'rationale'],
        additionalProperties: false
      }
    }
  };

  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-goog-api-key': apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText() || '';

  if (statusCode < 200 || statusCode >= 300) {
    return {
      status: 'error',
      message: `Gemini request failed (${statusCode})`,
      details: bodyText
    };
  }

  const body = safeJsonParse_(bodyText, {});
  const responseText = extractGeminiText_(body);
  const parsed = parseGeminiJson_(responseText);

  return {
    status: 'success',
    source: 'gemini',
    model: GEMINI_MODEL,
    offsetSec: clampNumber_(parsed.offsetSec, -30, 30, 0),
    confidence: clampNumber_(parsed.confidence, 0, 1, 0),
    rationale: text_(parsed.rationale || ''),
    raw: responseText
  };
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
      songs.push(serializeSong_(song));
    }
  }

  return songs;
}

function getSongById_(id) {
  const sheet = getSheet_();
  const existing = findRowById_(sheet, id);
  return existing ? serializeSong_(existing) : null;
}

function rowToSong_(row, rowIndex, headerMap) {
  const map = headerMap || buildHeaderMap_(getSheet_().getDataRange().getValues()[0]);

  function read(name) {
    const idx = map[name];
    return idx === undefined ? '' : row[idx];
  }

  return normalizeSong_({
    id: read('id'),
    title: read('title'),
    artist: read('artist'),
    audioFileId: read('audioFileId'),
    imageFileId: read('imageFileId'),
    lyricsFileId: read('lyricsFileId'),
    audioUrl: read('audioUrl'),
    coverUrl: read('coverUrl'),
    lyricsData: read('lyricsData'),
    createdAt: read('createdAt'),
    updatedAt: read('updatedAt'),
    rowIndex: rowIndex,
    rowValues: row
  });
}

function normalizeSong_(song) {
  const audioUrl = text_(song.audioUrl || song.url || (song.audioFileId ? makeDriveViewUrl_(song.audioFileId) : ''));
  const coverUrl = text_(song.coverUrl || song.cover || (song.imageFileId ? makeDriveViewUrl_(song.imageFileId) : ''));
  const profileUrl = text_(song.profileUrl || song.profile || coverUrl);

  return {
    id: text_(song.id),
    title: text_(song.title),
    artist: text_(song.artist || 'Andre Youth') || 'Andre Youth',
    audioFileId: text_(song.audioFileId),
    imageFileId: text_(song.imageFileId),
    lyricsFileId: text_(song.lyricsFileId),
    audioUrl: audioUrl,
    coverUrl: coverUrl,
    profileUrl: profileUrl || coverUrl,
    url: audioUrl,
    cover: coverUrl,
    profile: profileUrl || coverUrl,
    lyricsData: text_(song.lyricsData),
    createdAt: text_(song.createdAt),
    updatedAt: text_(song.updatedAt),
    rowIndex: song.rowIndex,
    rowValues: song.rowValues
  };
}

function serializeSong_(song) {
  const normalized = normalizeSong_(song);
  delete normalized.rowIndex;
  delete normalized.rowValues;
  return normalized;
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
    const key = text_(headerRow[i]).trim();
    if (key) map[key] = i;
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
  const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const firstRow = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  const currentHeaders = firstRow.map(value => text_(value).trim());

  if (!currentHeaders.some(Boolean)) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const mergedHeaders = currentHeaders.slice();
  HEADERS.forEach(header => {
    if (mergedHeaders.indexOf(header) === -1) {
      mergedHeaders.push(header);
    }
  });

  if (mergedHeaders.join('|') !== currentHeaders.join('|')) {
    sheet.getRange(1, 1, 1, mergedHeaders.length).setValues([mergedHeaders]);
  }

  sheet.setFrozenRows(1);
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
  if (!values.length) return null;

  const map = buildHeaderMap_(values[0]);
  const idIndex = map.id;
  if (idIndex === undefined) return null;

  const target = text_(id).trim();
  for (let i = 1; i < values.length; i++) {
    if (text_(values[i][idIndex]).trim() === target) {
      return rowToSong_(values[i], i + 1, map);
    }
  }

  return null;
}

function findRowByTitle_(sheet, title) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return null;

  const map = buildHeaderMap_(values[0]);
  const titleIndex = map.title;
  if (titleIndex === undefined) return null;

  const target = text_(title).trim();
  for (let i = 1; i < values.length; i++) {
    if (text_(values[i][titleIndex]).trim() === target) {
      return rowToSong_(values[i], i + 1, map);
    }
  }

  return null;
}

function saveBase64File_(options) {
  const base64 = text_(options.base64).replace(/^data:[^;]+;base64,/, '');
  const binary = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(
    binary,
    options.mimeType || 'application/octet-stream',
    sanitizeFileName_(options.fileName || 'file')
  );
  const folder = options.folderId ? DriveApp.getFolderById(options.folderId) : DriveApp.getRootFolder();
  return folder.createFile(blob);
}

function sanitizeFileName_(name) {
  return text_(name || 'file')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function getGeminiApiKey_() {
  // Set GEMINI_API_KEY in Apps Script -> Project Settings -> Script properties.
  return text_(PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')).trim();
}

function buildGeminiOffsetPrompt_(lyricsRaw, title, artist) {
  return [
    'You are helping align song lyrics to audio.',
    'Return ONLY valid JSON that matches this shape: {"offsetSec":number,"confidence":number,"rationale":string}.',
    'offsetSec is a global shift in seconds applied to all timestamps.',
    'Positive offsetSec means the provided lyric timestamps are too early and should be moved later.',
    'Negative offsetSec means the provided lyric timestamps are too late and should be moved earlier.',
    'If the lyrics have no timestamps, return offsetSec 0 and low confidence.',
    'Do not invent per-line offsets; estimate only the global offset.',
    `Title: ${title || 'unknown'}`,
    `Artist: ${artist || 'unknown'}`,
    'Lyrics:',
    lyricsRaw
  ].join('\n');
}

function sanitizeBase64_(value) {
  return text_(value)
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '');
}

function estimateBase64Size_(base64Text) {
  const safeLength = Math.max(0, text_(base64Text).length);
  return Math.floor((safeLength * 3) / 4);
}

function normalizeMimeType_(mimeType) {
  const value = text_(mimeType).trim().toLowerCase();
  if (!value) return 'audio/mpeg';
  if (value === 'audio/mp3') return 'audio/mpeg';
  return value;
}

function safeJsonParse_(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function parseGeminiJson_(text) {
  if (!text) {
    return { offsetSec: 0, confidence: 0, rationale: '' };
  }

  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const parsed = safeJsonParse_(cleaned, null);
  if (parsed && typeof parsed === 'object') {
    return parsed;
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const sliced = cleaned.slice(firstBrace, lastBrace + 1);
    const slicedParsed = safeJsonParse_(sliced, null);
    if (slicedParsed && typeof slicedParsed === 'object') {
      return slicedParsed;
    }
  }

  return { offsetSec: 0, confidence: 0, rationale: cleaned.slice(0, 240) };
}

function extractGeminiText_(body) {
  const candidates = body && Array.isArray(body.candidates) ? body.candidates : [];
  for (let i = 0; i < candidates.length; i++) {
    const parts = candidates[i] && candidates[i].content && Array.isArray(candidates[i].content.parts)
      ? candidates[i].content.parts
      : [];
    const text = parts.map(part => text_(part && part.text ? part.text : '')).join('').trim();
    if (text) return text;
  }

  if (body && body.promptFeedback && body.promptFeedback.blockReason) {
    return text_(body.promptFeedback.blockReason);
  }

  return '';
}

function clampNumber_(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
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
  const data = {};

  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(key => {
      data[key] = e.parameter[key];
    });
  }

  const raw = e && e.postData && e.postData.contents ? String(e.postData.contents).trim() : '';
  if (!raw) return data;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.keys(parsed).forEach(key => {
        data[key] = parsed[key];
      });
      return data;
    }
  } catch (error) {
    // Fall through to form parsing.
  }

  const formData = parseQueryString_(raw);
  Object.keys(formData).forEach(key => {
    data[key] = formData[key];
  });

  return data;
}

function parseQueryString_(raw) {
  const result = {};
  raw.split('&').forEach(pair => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const keyPart = idx === -1 ? pair : pair.slice(0, idx);
    const valuePart = idx === -1 ? '' : pair.slice(idx + 1);

    let key = keyPart;
    let value = valuePart;

    try {
      key = decodeURIComponent(key.replace(/\+/g, ' '));
    } catch (error) {
      key = key.replace(/\+/g, ' ');
    }

    try {
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch (error) {
      value = value.replace(/\+/g, ' ');
    }

    if (key) {
      result[key] = value;
    }
  });
  return result;
}

function getParam_(e, name, fallback) {
  if (e && e.parameter && e.parameter[name] !== undefined && e.parameter[name] !== null) {
    return e.parameter[name];
  }
  return fallback;
}

function text_(value, fallback) {
  return value === undefined || value === null ? (fallback || '') : String(value);
}

function errorPayload_(error) {
  return {
    status: 'error',
    message: error && error.message ? error.message : String(error)
  };
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
