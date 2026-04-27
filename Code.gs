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
