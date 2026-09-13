// share-card.js — High-Resolution Balanced Instagram Story Generator (1080x1920)
window.generateStoryCard = async function(options) {
  // options: { isResponse: boolean, questionText, responseText, isAudio, audioDuration, slug, filename }
  const card = document.getElementById('story-card-render');
  if (!card) {
    alert('Story card template not found.');
    return;
  }

  const qBox = card.querySelector('#story-q-box');
  const qTag = card.querySelector('.story-box-tag.question-tag');
  const qText = card.querySelector('#story-question-display');
  const connector = card.querySelector('#story-connector-arrow');
  const aBox = card.querySelector('#story-a-box');
  const aTag = card.querySelector('#story-answer-tag');
  const aText = card.querySelector('#story-answer-display');
  const footerHint = card.querySelector('.story-footer-hint');

  if (options.isGeneral) {
    // Sharing an open thought: ONLY the reply box appears on the story!
    qBox.style.display = 'none';
    connector.style.display = 'none';
    aBox.style.display = 'block';

    if (options.isAudio) {
      aTag.textContent = `🎙️ ANONYMOUS VOICE • ${options.audioDuration || 0}s`;
      aText.innerHTML = `
        <div class="story-voice-waveform">
          <span>▶</span>
          <span style="letter-spacing: 2px;">ılıılılı|lllı|lı</span>
          <span style="font-size: 38px; color: #94a3b8;">${options.audioDuration || 0}s</span>
        </div>
      `;
    } else {
      aTag.textContent = '💭 ANONYMOUS THOUGHT';
      aText.textContent = options.responseText || '';
    }

    footerHint.textContent = '🔗 Tap the link sticker to share your thoughts on PsychoBandhu';
  } else if (options.isResponse) {
    // Sharing a response with question on top
    qBox.style.display = 'block';
    qTag.textContent = '💬 QUESTION';
    qText.textContent = options.questionText || '';
    connector.style.display = 'flex';
    aBox.style.display = 'block';

    if (options.isAudio) {
      aTag.textContent = `🎙️ VOICE NOTE • ${options.audioDuration || 0}s`;
      aText.innerHTML = `
        <div class="story-voice-waveform">
          <span>▶</span>
          <span style="letter-spacing: 2px;">ılıılılı|lllı|lı</span>
          <span style="font-size: 38px; color: #94a3b8;">${options.audioDuration || 0}s</span>
        </div>
      `;
    } else {
      aTag.textContent = '🔒 ANONYMOUS REPLY';
      aText.textContent = options.responseText || '';
    }

    footerHint.textContent = '🔗 Tap the link sticker to reply on PsychoBandhu';
  } else {
    // Sharing just the Question (asking for replies)
    qBox.style.display = 'block';
    qTag.textContent = '✨ ASK ME ANYTHING';
    qText.textContent = options.questionText || '';
    connector.style.display = 'none';
    aBox.style.display = 'none';
    footerHint.textContent = '🔗 Tap the link sticker to reply anonymously';
  }

  try {
    if (typeof html2canvas === 'undefined') {
      alert('Generating card... please try again in a few seconds.');
      return;
    }

    // Place temporarily at 0,0 behind viewport for accurate rendering
    const originalPos = card.style.position;
    const originalLeft = card.style.left;
    const originalTop = card.style.top;
    const originalZ = card.style.zIndex;

    card.style.position = 'fixed';
    card.style.left = '0px';
    card.style.top = '0px';
    card.style.zIndex = '-9999';
    card.style.display = 'flex';

    await new Promise(r => setTimeout(r, 120));

    const canvas = await html2canvas(card, {
      scale: 1,
      width: 1080,
      height: 1920,
      windowWidth: 1080,
      windowHeight: 1920,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#070a12'
    });

    // Restore original position
    card.style.position = originalPos;
    card.style.left = originalLeft;
    card.style.top = originalTop;
    card.style.zIndex = originalZ;

    const link = document.createElement('a');
    link.download = options.filename || 'psychobandhu-story.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Error generating card:', err);
    alert('Could not generate story card: ' + err.message);
  }
};
