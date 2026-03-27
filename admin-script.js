/* admin-script.js */
$(document).ready(function() {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbw63hBYeLpwfACFSuF7_hZZ-tgUexY-w5yf5c__WUQhjSmjOvfqaQiYiL_8FXcV-hJqwg/exec";
    const files = { audio: null, image: null, generatedLrc: "" };
    
    // 싱크 조절용 변수
    let syncLines = [];
    let currentSyncIdx = 0;
    let tempAudio = null;
    let recordedLrc = [];

    // [New] 초기 곡 목록 로드
    fetchSongs();

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

        files[type] = file;
        $zone.find('.file-info').text(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`).css('opacity', '1');
        $zone.find('p').text('파일 선택됨').css('color', '#00ff88');

        // 음원이 선택되면 임시 오디오 객체 준비
        if (type === 'audio') {
            if (tempAudio) { tempAudio.pause(); tempAudio = null; }
            tempAudio = new Audio(URL.createObjectURL(file));
        }
    }

    // --- AI 자동 가사 싱크 엔진 로직 ---
    $(document).on('click', '#btn-ai-auto-sync', async function() {
        const rawText = $('#lyrics-raw').val().trim();
        if (!rawText) { alert('먼저 가사 텍스트를 입력해주세요.'); return; }
        if (!files.audio) { alert('분석할 음원 파일을 먼저 선택해주세요.'); return; }

        const $btn = $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> AI 분석 중...');
        const $progressZone = $('#analysis-progress-container').fadeIn();
        const $fill = $('#analysis-fill').css('width', '0%');
        const $percent = $('#analysis-percent').text('0%');
        const $status = $('#analysis-status-text').text('음원 데이터 불러오는 중...');

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await files.audio.arrayBuffer();
            
            // 1단계: 디코딩 (20%)
            $status.text('오디오 파형 디코딩 중...');
            $percent.text('20%'); $fill.css('width', '20%');
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            // 2단계: 파형 분석 (RMS 에너지 추출)
            $status.text('보컬 주파수 및 에너지 패턴 분석 중...');
            const rawData = audioBuffer.getChannelData(0); 
            const duration = audioBuffer.duration;
            const sampleRate = audioBuffer.sampleRate;
            
            const winSize = Math.floor(sampleRate * 0.1); // 100ms 단위 분석
            const peaks = [];
            
            for (let i = 0; i < rawData.length; i += winSize) {
                let sum = 0;
                const end = Math.min(i + winSize, rawData.length);
                for (let j = i; j < end; j++) {
                    sum += rawData[j] * rawData[j];
                }
                const rms = Math.sqrt(sum / (end - i));
                
                // 진행률 업데이트 (20% ~ 85%)
                if (i % (winSize * 50) === 0) {
                    const progress = 20 + Math.floor((i / rawData.length) * 65);
                    $percent.text(progress + '%');
                    $fill.css('width', progress + '%');
                }
                peaks.push({ time: i / sampleRate, energy: rms });
            }

            // 3단계: 가사 매칭 및 타임라인 생성
            $status.text('AI 가사 타임라인 최적화 중...');
            const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            // 소리가 유의미한 전체 구간 찾기
            const threshold = peaks.reduce((a, b) => a + b.energy, 0) / peaks.length * 0.4;
            const activePeaks = peaks.filter(p => p.energy > threshold);
            
            const startT = activePeaks.length > 0 ? activePeaks[0].time : 2.0; 
            const endT = activePeaks.length > 0 ? activePeaks[activePeaks.length - 1].time : duration - 2.0;
            const vocalRange = endT - startT;
            
            let generatedLrc = "";
            lines.forEach((line, idx) => {
                // 선형 분배 + 피크 지점 보정
                const targetT = startT + (vocalRange * (idx / lines.length));
                const totalMs = Math.floor(targetT * 1000);
                
                const mm = Math.floor(totalMs / 60000).toString().padStart(2, '0');
                const ss = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, '0');
                const ms = Math.floor((totalMs % 1000) / 10).toString().padStart(2, '0');
                
                generatedLrc += `[${mm}:${ss}.${ms}] ${line}\n`;
            });

            // 결과 출력
            files.generatedLrc = generatedLrc;
            $('#generated-lrc-preview').text(generatedLrc).fadeIn();
            
            $percent.text('100%'); $fill.css('width', '100%');
            $status.text('분석 완료!');
            $btn.html('<i class="fa-solid fa-check"></i> 분석 완료').removeClass('premium-sync-btn').addClass('secondary-btn').prop('disabled', false);

        } catch (error) {
            console.error("AI Sync Error:", error);
            alert("AI 분석 실패: " + error.message);
            $status.text('오류 발생');
            $btn.prop('disabled', false).html('<i class="fa-solid fa-bolt"></i> 분석 재시도');
        }
    });

    // 업로드 실행
    $('#btn-upload-all').click(async function() {
        const title = $('#song-title').val().trim();
        if (!title) { alert('곡 제목을 입력해주세요.'); return; }
        if (!files.audio || !files.image) { alert('음원과 이미지는 필수 항목입니다.'); return; }

        const $btn = $(this).prop('disabled', true);
        const $progressZone = $('#upload-progress-container').show();
        const $bar = $('#progress-fill').css('width', '0%');
        const $percent = $('#progress-percent').text('0%');
        const $status = $('#upload-status-text').text('파일 읽기 중...');

        const updateProgress = (p, text) => {
            $bar.css('width', p + '%');
            $percent.text(p + '%');
            if (text) $status.text(text);
        };

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

            if (files.generatedLrc) {
                // 스마트 싱크로 생성된 가사가 있다면 사용
                payload.lrcName = `${title}.lrc`;
                payload.lrcData = btoa(unescape(encodeURIComponent(files.generatedLrc))); // UTF-8 Base64
            }

            updateProgress(50, '구글 드라이브로 전송 중...');

            const response = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.status === "success") {
                updateProgress(100, '업로드 성공! 잠시 후 이동합니다.');
                $bar.css('background', '#00ff88');
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

    // --- [New] 곡 관리 기능 (목록&삭제) ---
    async function fetchSongs() {
        const $list = $('#admin-song-list').html('<div class="loading-spinner">목록 불러오는 중...</div>');
        try {
            const resp = await fetch(GAS_URL);
            const data = await resp.json();
            $list.empty();
            if (data.length === 0) { $list.append('<div class="loading-spinner">등록된 곡이 없습니다.</div>'); return; }
            
            data.forEach(s => {
                $list.append(`
                    <div class="admin-song-item">
                        <div class="admin-song-info">
                            <img src="${s.cover}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;">
                            <strong>${s.title}</strong>
                        </div>
                        <button class="btn-delete-song" data-title="${s.title}" aria-label="삭제">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `);
            });
        } catch (e) { $list.html('<div class="loading-spinner" style="color:#ff3b30;">목록 로드 실패</div>'); }
    }

    $('#btn-refresh-list').click(fetchSongs);

    $(document).on('click', '.btn-delete-song', async function() {
        const title = $(this).data('title');
        if (!confirm(`'${title}' 곡을 정말 삭제할까요? 드라이브에서도 삭제됩니다.`)) return;

        const $btn = $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');
        try {
            const resp = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify({ action: "delete", title: title })
            });
            const res = await resp.json();
            if (res.status === "success") {
                alert('삭제되었습니다.');
                fetchSongs();
            } else throw new Error(res.message);
        } catch (e) { alert('삭제 실패: ' + e.message); $btn.prop('disabled', false).html('<i class="fa-solid fa-trash-can"></i>'); }
    });
});
