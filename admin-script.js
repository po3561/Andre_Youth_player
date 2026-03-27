/* admin-script.js */
$(document).ready(function() {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbw63hBYeLpwfACFSuF7_hZZ-tgUexY-w5yf5c__WUQhjSmjOvfqaQiYiL_8FXcV-hJqwg/exec";
    const files = { audio: null, image: null, lyrics: null };

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
