/**
 * Andre Youth Player - 통합 백엔드 (Code.gs)
 * 
 * [조치 사항]
 * 1. 이 내용을 전체 복사해서 GAS 에디터에 붙여넣으세요.
 * 2. 상단 메뉴 [배포] -> [배포 관리] -> [편집] -> [새 버전] -> [배포]를 누르세요.
 */

const CONFIG = {
  // 사용자의 스프레드시트 ID가 반영되었습니다.
  SPREADSHEET_ID: '1M1N_qOpCRoVWfFnu3qP0B3ZoG2ipeertFsP-uZMPDPI', 
  SHEET_NAME: 'Songs',
  SETTINGS_SHEET: 'Settings',
  
  // 파일 저장을 위한 폴더 ID (필요 시 입력)
  AUDIO_FOLDER_ID: '', 
  IMAGE_FOLDER_ID: '', 
  LRC_FOLDER_ID: ''
};

const HEADERS = [
  'id', 'title', 'artist', 'audioFileId', 'imageFileId', 'lyricsFileId', 
  'syncOffset', 'syncMinGap', 'audioUrl', 'coverUrl', 'lyricsData', 
  'createdAt', 'updatedAt'
];

/**
 * GET 요청 처리 (목록 불러오기, 부트스트랩)
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action ? String(e.parameter.action) : 'bootstrap').toLowerCase();
  
  let result;
  try {
    if (action === 'ping') {
      result = { status: 'ok' };
    } else if (action === 'bootstrap') {
      result = getBootstrapData_();
    } else if (action === 'settings') {
      result = { status: 'ok', settings: getAppSettings_() };
    } else if (action === 'song' && e.parameter.id) {
      result = getSongById_(String(e.parameter.id));
    } else {
      result = { status: 'ok', songs: listSongs_() };
    }
  } catch (error) {
    result = { status: 'error', message: error.toString() };
  }

  // JSONP 지원 (크로스 도메인 이슈 해결)
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return json_(result);
}

/**
 * POST 요청 처리
 */
function doPost(e) {
  let data = {};
  try {
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
  } catch (f) {
    data = e.parameter || {};
  }
  
  const action = String(data.action || 'create').toLowerCase();
  let result;

  try {
    if (action === 'delete') {
      result = deleteSong_(data);
    } else if (action === 'update') {
      result = updateSong_(data);
    } else if (action === 'update-settings') {
      result = updateAppSettings_(data.settings);
    } else {
      result = upsertSong_(data);
    }
  } catch (error) {
    result = { status: 'error', message: error.toString() };
  }

  return json_(result);
}

function getBootstrapData_() {
  return {
    status: 'ok',
    songs: listSongs_(),
    settings: getAppSettings_(),
    revision: Date.now().toString()
  };
}

function getAppSettings_() {
  try {
    const sheet = getSettingsSheet_();
    const data = sheet.getDataRange().getValues();
    const settings = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) settings[data[i][0]] = data[i][1];
    }
    return settings;
  } catch (e) {
    return {};
  }
}

function updateAppSettings_(settingsJson) {
  const settings = typeof settingsJson === 'string' ? JSON.parse(settingsJson) : settingsJson;
  const sheet = getSettingsSheet_();
  sheet.clear();
  sheet.appendRow(['Key', 'Value']);
  Object.keys(settings).forEach(key => {
    sheet.appendRow([key, settings[key]]);
  });
  return { status: 'success' };
}

function listSongs_() {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const map = buildHeaderMap_(rows[0]);
  const songs = [];

  for (let i = 1; i < rows.length; i++) {
    const song = rowToSong_(rows[i], i + 1, map);
    if (song && song.title) songs.push(song);
  }
  return songs.reverse();
}

function upsertSong_(data) {
  if (!data.title) throw new Error('제목이 필요합니다.');
  const sheet = getSheet_();
  const now = new Date().toISOString();
  const songId = data.id || Utilities.getUuid();
  
  let audioId = data.audioFileId || '';
  if (data.audioData) {
    audioId = saveFile_(data.audioData, data.audioName || (data.title + '.mp3'), data.audioMime, CONFIG.AUDIO_FOLDER_ID);
  }
  
  let imageId = data.imageFileId || '';
  if (data.imageData) {
    imageId = saveFile_(data.imageData, data.imageName || (data.title + '.jpg'), data.imageMime, CONFIG.IMAGE_FOLDER_ID);
  }
  
  let lyricsId = data.lyricsFileId || '';
  if (data.lrcData) {
    lyricsId = saveFile_(data.lrcData, data.lrcName || (data.title + '.lrc'), 'text/plain', CONFIG.LRC_FOLDER_ID);
  }

  const song = {
    id: songId, title: data.title, artist: data.artist || 'Andre Youth',
    audioFileId: audioId, imageFileId: imageId, lyricsFileId: lyricsId,
    syncOffset: data.syncOffset || 0, syncMinGap: data.syncMinGap || 0.22,
    audioUrl: makeUrl_(audioId), coverUrl: makeUrl_(imageId),
    lyricsData: lyricsId ? readFile_(lyricsId) : (data.lyricsRaw || ''),
    createdAt: now, updatedAt: now
  };

  const existing = findRowById_(sheet, songId);
  if (existing) updateRow_(sheet, existing.rowIndex, song);
  else appendRow_(sheet, song);

  return { status: 'success', song: song };
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSettingsSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SETTINGS_SHEET);
    sheet.appendRow(['Key', 'Value']);
  }
  return sheet;
}

function saveFile_(base64, name, mime, folderId) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, name);
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

function readFile_(id) {
  try { return DriveApp.getFileById(id).getBlob().getDataAsString(); } catch(e) { return ''; }
}

function deleteSong_(data) {
  const sheet = getSheet_();
  const id = data && data.id ? String(data.id) : '';
  const title = data && data.title ? String(data.title) : '';
  
  if (!id && !title) throw new Error('id 또는 title이 필요합니다.');
  
  let existing = null;
  if (id) {
    existing = findRowById_(sheet, id);
  }
  if (!existing && title) {
    // title로 fallback 검색
    const rows = sheet.getDataRange().getValues();
    const map = buildHeaderMap_(rows[0]);
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][map.title] || '') === title) {
        existing = rowToSong_(rows[i], i + 1, map);
        break;
      }
    }
  }
  
  if (!existing) throw new Error('곡을 찾을 수 없습니다.');
  
  // 드라이브 파일 삭제
  ['audioFileId', 'imageFileId', 'lyricsFileId'].forEach(function(key) {
    var fileId = existing[key];
    if (fileId) {
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) { /* ignore */ }
    }
  });
  
  sheet.deleteRow(existing.rowIndex);
  return { status: 'success', action: 'delete', id: existing.id };
}

function getSongById_(id) {
  const sheet = getSheet_();
  const existing = findRowById_(sheet, String(id));
  if (!existing) return { status: 'error', message: 'song not found' };
  return { status: 'ok', song: existing };
}

function updateSong_(data) {
  if (!data || !data.id) throw new Error('id가 필요합니다.');
  const sheet = getSheet_();
  const existing = findRowById_(sheet, String(data.id));
  if (!existing) throw new Error('곡을 찾을 수 없습니다.');
  
  const now = new Date().toISOString();
  const song = {
    id: existing.id,
    title: data.title ? String(data.title) : existing.title,
    artist: data.artist ? String(data.artist) : existing.artist,
    audioFileId: existing.audioFileId,
    imageFileId: existing.imageFileId,
    lyricsFileId: existing.lyricsFileId,
    syncOffset: data.syncOffset !== undefined ? Number(data.syncOffset) : (existing.syncOffset || 0),
    syncMinGap: data.syncMinGap !== undefined ? Number(data.syncMinGap) : (existing.syncMinGap || 0.22),
    createdAt: existing.createdAt,
    updatedAt: now
  };
  
  if (data.audioData) {
    try { DriveApp.getFileById(existing.audioFileId).setTrashed(true); } catch(e) {}
    song.audioFileId = saveFile_(data.audioData, data.audioName || (song.title + '.mp3'), data.audioMime || 'audio/mpeg', CONFIG.AUDIO_FOLDER_ID);
  }
  if (data.imageData) {
    try { DriveApp.getFileById(existing.imageFileId).setTrashed(true); } catch(e) {}
    song.imageFileId = saveFile_(data.imageData, data.imageName || (song.title + '.jpg'), data.imageMime || 'image/jpeg', CONFIG.IMAGE_FOLDER_ID);
  }
  if (data.lrcData) {
    try { DriveApp.getFileById(existing.lyricsFileId).setTrashed(true); } catch(e) {}
    song.lyricsFileId = saveFile_(data.lrcData, data.lrcName || (song.title + '.lrc'), 'text/plain', CONFIG.LRC_FOLDER_ID);
  }
  
  song.audioUrl = makeUrl_(song.audioFileId);
  song.coverUrl = makeUrl_(song.imageFileId);
  song.lyricsData = song.lyricsFileId ? readFile_(song.lyricsFileId) : (existing.lyricsData || '');
  
  updateRow_(sheet, existing.rowIndex, song);
  return { status: 'success', action: 'update', song: song };
}

function makeUrl_(id) {
  return id ? 'https://drive.google.com/uc?export=download&id=' + id : '';
}

function buildHeaderMap_(row) {
  const map = {};
  row.forEach((h, i) => map[h] = i);
  return map;
}

function rowToSong_(row, idx, map) {
  const s = {};
  HEADERS.forEach(h => s[h] = row[map[h]]);
  s.rowIndex = idx;
  return s;
}

function findRowById_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  const map = buildHeaderMap_(data[0]);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][map.id]) === String(id)) return rowToSong_(data[i], i+1, map);
  }
  return null;
}

function appendRow_(sheet, s) {
  sheet.appendRow(HEADERS.map(h => s[h]));
}

function updateRow_(sheet, idx, s) {
  sheet.getRange(idx, 1, 1, HEADERS.length).setValues([HEADERS.map(h => s[h])]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
