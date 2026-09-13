// recorder.js — Plain vanilla audio recorder (capped at 60 seconds)
(function() {
  let mediaRecorder = null;
  let audioChunks = [];
  let timerInterval = null;
  let secondsElapsed = 0;
  let audioBlob = null;
  const MAX_SECONDS = 60;

  const btnRecord = document.getElementById('btn-record');
  const btnStop = document.getElementById('btn-stop');
  const btnReset = document.getElementById('btn-reset');
  const btnSubmitAudio = document.getElementById('btn-submit-audio');
  const timerDisplay = document.getElementById('timer-display');
  const audioPreview = document.getElementById('audio-preview');
  const statusNotice = document.getElementById('recorder-status');

  if (!btnRecord) return;

  function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateTimer() {
    secondsElapsed++;
    timerDisplay.textContent = formatTime(secondsElapsed);
    if (secondsElapsed >= MAX_SECONDS) {
      stopRecording();
      if (statusNotice) statusNotice.textContent = 'Maximum 60s reached.';
    }
  }

  async function startRecording() {
    audioChunks = [];
    audioBlob = null;
    secondsElapsed = 0;
    timerDisplay.textContent = '00:00';
    if (statusNotice) statusNotice.textContent = 'Recording...';
    if (audioPreview) {
      audioPreview.pause();
      audioPreview.style.display = 'none';
      audioPreview.src = '';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick best supported mimetype
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      }

      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || 'audio/webm';
        audioBlob = new Blob(audioChunks, { type });
        if (audioPreview) {
          audioPreview.src = URL.createObjectURL(audioBlob);
          audioPreview.style.display = 'block';
        }
        stream.getTracks().forEach(track => track.stop());
        btnSubmitAudio.disabled = false;
        btnReset.style.display = 'inline-flex';
        btnStop.style.display = 'none';
        btnRecord.style.display = 'none';
        if (statusNotice) statusNotice.textContent = 'Recording ready. Listen to preview or send.';
      };

      mediaRecorder.start(250); // collect 250ms chunks
      timerInterval = setInterval(updateTimer, 1000);

      btnRecord.style.display = 'none';
      btnStop.style.display = 'inline-flex';
      btnReset.style.display = 'none';
      btnSubmitAudio.disabled = true;
    } catch (err) {
      console.error('Microphone error:', err);
      if (statusNotice) statusNotice.textContent = 'Microphone permission was denied or unavailable.';
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    clearInterval(timerInterval);
  }

  function resetRecording() {
    stopRecording();
    audioChunks = [];
    audioBlob = null;
    secondsElapsed = 0;
    timerDisplay.textContent = '00:00';
    if (audioPreview) {
      audioPreview.pause();
      audioPreview.src = '';
      audioPreview.style.display = 'none';
    }
    btnRecord.style.display = 'inline-flex';
    btnStop.style.display = 'none';
    btnReset.style.display = 'none';
    btnSubmitAudio.disabled = true;
    if (statusNotice) statusNotice.textContent = '';
  }

  async function submitAudio() {
    if (!audioBlob) return;
    const slug = document.getElementById('question-slug').value;
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-reply.webm');
    formData.append('duration', secondsElapsed.toString());

    btnSubmitAudio.disabled = true;
    if (statusNotice) statusNotice.textContent = 'Sending anonymous voice reply...';

    try {
      const response = await fetch(`/q/${slug}/reply-audio`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        window.location.href = `/q/${slug}?sent=true`;
      } else {
        if (statusNotice) statusNotice.textContent = result.error || 'Failed to send audio.';
        btnSubmitAudio.disabled = false;
      }
    } catch (err) {
      console.error('Upload error:', err);
      if (statusNotice) statusNotice.textContent = 'Network error while sending.';
      btnSubmitAudio.disabled = false;
    }
  }

  btnRecord.addEventListener('click', startRecording);
  btnStop.addEventListener('click', stopRecording);
  btnReset.addEventListener('click', resetRecording);
  btnSubmitAudio.addEventListener('click', submitAudio);
})();
