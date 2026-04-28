(() => {
    // playlist-data.js
    // 이 파일은 GAS 백엔드 로드 전에 빈 배열을 설정합니다.
    // GAS에서 최신 데이터를 받으면 script.js가 이 배열을 업데이트합니다.
    // 하드코딩된 데이터는 삭제된 곡이 계속 표시되는 문제의 원인이었습니다.
    window.PUBLIC_PLAYLIST = [];
})();
