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
const SETTINGS_PROPERTY_KEY = 'APP_SETTINGS_V1';
const CACHE_BOOTSTRAP_KEY = 'bootstrap_v3';
const CACHE_SONG_PREFIX = 'song_v1_';
const CACHE_TTL_SEC = 30;
const CACHE_FILE_EXISTS_PREFIX = 'file_exists_v1_';

const HEADERS = [
  'id',
  'title',
  'artist',
  'audioFileId',
  'imageFileId',
  'lyricsFileId',
  'syncOffset',
  'syncMinGap',
  'audioUrl',
  'coverUrl',
  'lyricsData',
  'createdAt',
  'updatedAt'
];

function doGet(e) {
  const callback = text_(getParam_(e, 'callback', '')).trim();
  let payload;

  try {
    const action = String(getParam_(e, 'action', 'list')).toLowerCase();

    if (action === 'ping') {
      payload = {
        status: 'ok',
        ts: new Date().toISOString()
      };
    } else if (action === 'bootstrap') {
      payload = getBootstrapPayload_({
        includeLyrics: text_(getParam_(e, 'includeLyrics', '')).trim() === '1',
        lyricsLimit: Number(getParam_(e, 'lyricsLimit', 2)) || 2
      });
    } else if (action === 'settings') {
      payload = {
        status: 'ok',
        settings: getAppSettings_(),
        ts: new Date().toISOString()
      };
    } else if (action === 'song') {
      const id = getParam_(e, 'id', '');
      payload = id ? getSongById_(String(id)) : null;
    } else if (action === 'lyrics') {
      const id = getParam_(e, 'id', '');
      payload = id ? getSongLyricsById_(String(id)) : { status: 'error', message: 'id is required' };
    } else {
      payload = listSongs_();
    }
  } catch (error) {
    payload = errorPayload_(error);
  }

  if (callback) {
    return jsonp_(callback, payload);
  }

  return json_(payload);
}

function doPost(e) {
  const data = parseBody_(e);
  const bridge = isBridgeRequest_(data);
  let payload;

  try {
    const action = String(data.action || 'create').toLowerCase();

    if (action === 'delete') {
      payload = deleteSong_(data);
    } else if (action === 'update-settings' || action === 'settings-update') {
      payload = updateAppSettings_(data);
    } else if (action === 'update') {
      payload = updateSong_(data);
    } else if (action === 'ai-sync' || action === 'aisync' || action === 'analyze-lyrics') {
      payload = analyzeLyricsWithGemini_(data);
    } else {
      payload = upsertSong_(data);
    }
  } catch (error) {
    payload = errorPayload_(error);
  }

  if (bridge) {
    return bridge_(payload, data.requestId);
  }

  return json_(payload);
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
  const syncOffset = Number.isFinite(Number(data.syncOffset))
    ? Number(data.syncOffset)
    : (existing && Number.isFinite(Number(existing.syncOffset)) ? Number(existing.syncOffset) : 0);
  const syncMinGap = Number.isFinite(Number(data.syncMinGap))
    ? Number(data.syncMinGap)
    : (existing && Number.isFinite(Number(existing.syncMinGap)) ? Number(existing.syncMinGap) : 0.22);

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
    syncOffset: syncOffset,
    syncMinGap: syncMinGap,
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

    invalidateSongCaches_([song.id, previous && previous.id]);
    return { status: 'success', action: 'update', song: serializeSong_(song) };
  }

  appendRow_(sheet, song);
  invalidateSongCaches_([song.id]);
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
  invalidateSongCaches_([existing.id]);

  return { status: 'success', action: 'delete', id: existing.id };
}

function getBootstrapPayload_(options) {
  const includeLyrics = !!(options && options.includeLyrics);
  const lyricsLimit = Math.min(10, Math.max(0, Number(options && options.lyricsLimit) || 0));
  const cacheKey = includeLyrics
    ? `${CACHE_BOOTSTRAP_KEY}_lyrics_${lyricsLimit}`
    : CACHE_BOOTSTRAP_KEY;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    const parsed = safeJsonParse_(cached, null);
    if (parsed) return parsed;
  }

  const payload = {
    status: 'ok',
    ts: new Date().toISOString(),
    revision: getPlaylistRevision_(),
    settings: getAppSettings_(),
    songs: listSongsLite_({
      includeLyrics: includeLyrics,
      lyricsLimit: lyricsLimit
    })
  };
  cache.put(cacheKey, JSON.stringify(payload), CACHE_TTL_SEC);
  return payload;
}

function listSongsLite_(options) {
  const includeLyrics = !!(options && options.includeLyrics);
  const lyricsLimit = Math.min(10, Math.max(0, Number(options && options.lyricsLimit) || 0));
  let lyricsIncluded = 0;
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const headerMap = buildHeaderMap_(rows[0]);
  const songs = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const song = rowToSong_(row, i + 1, headerMap);
    if (song && song.title && isSongPlayable_(song)) {
      const item = {
        id: song.id,
        title: song.title,
        artist: song.artist || 'Andre Youth',
        audioFileId: song.audioFileId,
        imageFileId: song.imageFileId,
        lyricsFileId: song.lyricsFileId,
        syncOffset: song.syncOffset,
        syncMinGap: song.syncMinGap,
        url: song.url,
        cover: song.cover,
        profile: song.profile,
        updatedAt: song.updatedAt
      };

      if (includeLyrics && lyricsIncluded < lyricsLimit) {
        item.lyricsData = song.lyricsData || '';
        lyricsIncluded++;
      }
      songs.push(item);
    }
  }

  return songs;
}

function getSongLyricsById_(id) {
  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_SONG_PREFIX + text_(id).trim();
  const cached = cache.get(cacheKey);
  if (cached) {
    const parsed = safeJsonParse_(cached, null);
    if (parsed) return parsed;
  }

  const sheet = getSheet_();
  const existing = findRowById_(sheet, id);
  if (!existing) {
    return { status: 'error', message: 'song not found' };
  }

  const payload = {
    status: 'ok',
    id: existing.id,
    lyricsData: existing.lyricsData || '',
    syncOffset: existing.syncOffset,
    syncMinGap: existing.syncMinGap,
    updatedAt: existing.updatedAt
  };
  cache.put(cacheKey, JSON.stringify(payload), CACHE_TTL_SEC);
  return payload;
}

function getAppSettings_() {
  const raw = text_(PropertiesService.getScriptProperties().getProperty(SETTINGS_PROPERTY_KEY)).trim();
  const parsed = safeJsonParse_(raw, {});
  const defaults = {
    playlistTitle: 'Andre Youth Playlist',
    playlistSubtitle: '음악으로 길을 잇다',
    defaultArtist: 'Andre Youth',
    copyrightNotice: '본 플레이어는 비영리 목적의 내부 재생용입니다.',
    themePrimary: '#21ccf9',
    lyricHintText: 'TAP FOR LYRICS'
  };
  return Object.assign({}, defaults, parsed || {});
}

function updateAppSettings_(data) {
  const incoming = safeJsonParse_(text_(data && data.settings), null) || data || {};
  const current = getAppSettings_();
  const next = Object.assign({}, current, {
    playlistTitle: text_(incoming.playlistTitle || current.playlistTitle).slice(0, 80),
    playlistSubtitle: text_(incoming.playlistSubtitle || current.playlistSubtitle).slice(0, 120),
    defaultArtist: text_(incoming.defaultArtist || current.defaultArtist).slice(0, 80),
    copyrightNotice: text_(incoming.copyrightNotice || current.copyrightNotice).slice(0, 600),
    themePrimary: normalizeCssColor_(incoming.themePrimary || current.themePrimary),
    lyricHintText: text_(incoming.lyricHintText || current.lyricHintText).slice(0, 80)
  });

  PropertiesService.getScriptProperties().setProperty(SETTINGS_PROPERTY_KEY, JSON.stringify(next));
  invalidateSongCaches_([]);

  return {
    status: 'success',
    action: 'update-settings',
    settings: next
  };
}

function normalizeCssColor_(value) {
  const raw = text_(value).trim();
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(raw)) return raw;
  return '#21ccf9';
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
    if (song && song.title && isSongPlayable_(song)) {
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

function invalidateSongCaches_(ids) {
  const cache = CacheService.getScriptCache();
  cache.remove(CACHE_BOOTSTRAP_KEY);
  for (let i = 0; i <= 10; i++) {
    cache.remove(`${CACHE_BOOTSTRAP_KEY}_lyrics_${i}`);
  }
  (ids || []).forEach(id => {
    const clean = text_(id).trim();
    if (!clean) return;
    cache.remove(CACHE_SONG_PREFIX + clean);
  });
}

function getPlaylistRevision_() {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return 'empty';
  const map = buildHeaderMap_(rows[0]);
  const updatedIdx = map.updatedAt;
  let latest = '';
  for (let i = 1; i < rows.length; i++) {
    const value = updatedIdx === undefined ? '' : text_(rows[i][updatedIdx]).trim();
    if (value && value > latest) latest = value;
  }
  return `${rows.length - 1}:${latest || 'na'}`;
}

function isSongPlayable_(song) {
  const hasAudio = !!text_(song && song.audioFileId).trim();
  const hasCover = !!text_(song && song.imageFileId).trim();
  if (!hasAudio || !hasCover) return false;
  return fileExistsCached_(song.audioFileId) && fileExistsCached_(song.imageFileId);
}

function fileExistsCached_(fileId) {
  const id = text_(fileId).trim();
  if (!id) return false;

  const cache = CacheService.getScriptCache();
  const key = CACHE_FILE_EXISTS_PREFIX + id;
  const cached = cache.get(key);
  if (cached === '1') return true;
  if (cached === '0') return false;

  let exists = false;
  try {
    exists = !!DriveApp.getFileById(id);
  } catch (error) {
    exists = false;
  }
  cache.put(key, exists ? '1' : '0', CACHE_TTL_SEC);
  return exists;
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
    syncOffset: read('syncOffset'),
    syncMinGap: read('syncMinGap'),
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
    syncOffset: Number.isFinite(Number(song.syncOffset)) ? Number(song.syncOffset) : 0,
    syncMinGap: Number.isFinite(Number(song.syncMinGap)) ? Number(song.syncMinGap) : 0.22,
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
    song.syncOffset,
    song.syncMinGap,
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
    song.syncOffset,
    song.syncMinGap,
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

function isBridgeRequest_(data) {
  const transport = text_(data && data.transport).trim().toLowerCase();
  const responseMode = text_(data && data.responseMode).trim().toLowerCase();
  const output = text_(data && data.output).trim().toLowerCase();
  return transport === 'bridge' || responseMode === 'bridge' || output === 'bridge';
}

function sanitizeJsonpCallback_(callback) {
  const value = text_(callback).trim();
  if (!value) return '';
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(value) ? value : '';
}

function safeJsonForScript_(value) {
  const json = JSON.stringify(value);
  return String(json === undefined ? 'null' : json)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function jsonp_(callback, payload) {
  const safeCallback = sanitizeJsonpCallback_(callback) || 'callback';
  const body = `${safeCallback}(${safeJsonForScript_(payload)});`;
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function bridge_(payload, requestId) {
  const message = {
    source: 'andre-youth-gas-bridge',
    requestId: text_(requestId),
    payload: payload
  };

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Andre Youth Bridge</title>
</head>
<body>
  <script>
    (function() {
      var message = ${safeJsonForScript_(message)};
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      } catch (error) {}
      try {
        document.body.textContent = 'OK';
      } catch (error) {}
    })();
  </script>
</body>
</html>`;

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
