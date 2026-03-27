/* admin-script.js */
$(document).ready(function() {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbw63hBYeLpwfACFSuF7_hZZ-tgUexY-w5yf5c__WUQhjSmjOvfqaQiYiL_8FXcV-hJqwg/exec";
    const files = { audio: null, image: null, lyrics: null, generatedLrc: "" };
    
    // 싱크 조절용 변수
    let syncLines = [];
    let currentSyncIdx = 0;
    let tempAudio = null;
    let recordedLrc = [];

    // 드래그 앤 드롭 방지
    $(document).on('dragover dragenter drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });

    // 드롭 존 설정
    $('.drop-zone').on('dragover dragenter', function() {
        $(this).addClass('active');
    }).on('dragleave dragend drop', function() {
        $(this).removeClass('active');
    });

    $('.drop-zone').on('drop', function(e) {
        const type = $(this).data('type');
        const file = e.originalEvent.dataTransfer.files[0];
        handleFileSelect(type, file, $(this));
    });

    $('.drop-zone').on('click', function() {
        $(this).find('input[type="file"]').click();
    });

    $('input[type="file"]').on('change', function() {
        const type = $(this).parent().data('type');
        const file = this.files[0];
        handleFileSelect(type, file, $(this).parent());
    });

    function handleFileSelect(type, file, $zone) {
        if (!file) return;
        
        // 파일 검증
        if (type === 'audio' && !file.type.startsWith('audio/')) { alert('음원 파일만 선택 가능합니다.'); return; }
        if (type === 'image' && !file.type.startsWith('image/')) { alert('이미지 파일만 선택 가능합니다.'); return; }
        if (type === 'lyrics' && !file.name.endsWith('.lrc')) { alert('.lrc 가사 파일만 선택 가능합니다.'); return; }

        files[type] = file;
        $zone.find('.file-info').text(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`).css('opacity', '1');
        $zone.find('p').text('파일 선택됨').css('color', '#00ff88');

        // 음원이 선택되면 임시 오디오 객체 준비
        if (type === 'audio') {
            if (tempAudio) { tempAudio.pause(); tempAudio = null; }
            tempAudio = new Audio(URL.createObjectURL(file));
        }
    }

    // --- 가사 싱크 엔진 로직 ---
    $('#btn-sync-mode').click(function() {
        const rawText = $('#lyrics-raw').val().trim();
        if (!rawText) { alert('먼저 가사 텍스트를 입력해주세요.'); return; }
        if (!files.audio) { alert('싱크를 맞출 음원 파일을 먼저 선택해주세요.'); return; }

        syncLines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        currentSyncIdx = 0;
        recordedLrc = [];
        
        $(this).hide();
        $('#sync-active-info').fadeIn();
        updateSyncHint();
        
        if (tempAudio) {
            tempAudio.currentTime = 0;
            tempAudio.play().catch(e => alert('오디오 재생에 실패했습니다. 파일을 다시 확인해주세요.'));
        }
    });

    function updateSyncHint() {
        if (currentSyncIdx < syncLines.length) {
            $('#next-lyric-text').text(syncLines[currentSyncIdx]);
        } else {
            finishSync();
        }
    }

    $('#btn-tap-sync').click(function() {
        if (!tempAudio || currentSyncIdx >= syncLines.length) return;

        const time = tempAudio.currentTime;
        const minutes = Math.floor(time / 60);
        const seconds = (time % 60).toFixed(2);
        const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
        
        recordedLrc.push(`${timestamp}${syncLines[currentSyncIdx]}`);
        currentSyncIdx++;
        updateSyncHint();
    });

    function finishSync() {
        if (tempAudio) tempAudio.pause();
        files.generatedLrc = recordedLrc.join('\n');
        
        $('#sync-active-info').hide();
        $('#btn-sync-mode').show().html('<i class="fa-solid fa-check"></i> 싱크 다시 맞추기');
        $('#generated-lrc-preview').text("생성된 가사 데이터:\n" + files.generatedLrc).fadeIn();
        alert('가사 싱크 작업이 완료되었습니다! 이제 업로드를 진행하세요.');
    }

    // 업로드 실행
    $('#btn-upload-all').click(async function() {
        const title = $('#song-title').val().trim();
        if (!title) { alert('곡 제목을 입력해주세요.'); return; }
        if (!files.audio || !files.image) { alert('음원과 이미지는 필수 항목입니다.'); return; }

        const $btn = $(this).prop('disabled', true);
        const $progressZone = $('#upload-progress-container').show();
        const $bar = $('#progress-fill').css('width', '5%');
        const $status = $('#upload-status-text').text('파일 읽기 중...');

        try {
            const toBase64 = file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
            });

            const payload = {
                title: title,
                audioName: `${title}.mp3`,
                audioMime: files.audio.type,
                audioData: await toBase64(files.audio),
                imageName: `${title}.jpg`,
                imageMime: files.image.type,
                imageData: await toBase64(files.image)
            };

            if (files.lyrics) {
                payload.lrcName = `${title}.lrc`;
                payload.lrcData = await toBase64(files.lyrics);
            } else if (files.generatedLrc) {
                // 스마트 싱크로 생성된 가사가 있다면 사용
                payload.lrcName = `${title}.lrc`;
                payload.lrcData = btoa(unescape(encodeURIComponent(files.generatedLrc))); // UTF-8 Base64
            }

            $bar.css('width', '50%');
            $status.text('구글 드라이브로 전송 중...');

            const response = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.status === "success") {
                $bar.css('width', '100%').css('background', '#00ff88');
                $status.text('업로드 성공! 플레이어에 즉시 반영됩니다.');
                setTimeout(() => location.href = 'index.html', 2000);
            } else {
                throw new Error(result.message || "Unknown error");
            }

        } catch (error) {
            console.error("Upload Error:", error);
            $bar.css('width', '100%').css('background', '#ff3b30');
            $status.text('업로드 실패: ' + error.message);
            $btn.prop('disabled', false);
        }
    });
});
