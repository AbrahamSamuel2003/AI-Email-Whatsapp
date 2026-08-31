import { config } from '../../config/env.js';

export class VoiceTranscriberService {
  /**
   * Transcribes WhatsApp voice notes (ogg/opus) into text using Groq Whisper Large v3 Turbo
   */
  static async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    const apiKey = config.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('[Voice Transcriber] GROQ_API_KEY not configured, cannot transcribe voice note.');
      return '';
    }

    try {
      const formData = new FormData();
      const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' });
      formData.append('file', audioBlob, 'voice_note.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'json');
      formData.append(
        'prompt',
        'English, Tamil (தமிழ்), Tanglish, Hindi (हिन्दी), Hinglish: Hi, Hello, Vanakkam, Vannakam, வணக்கம், Namaste, Namasthe, नमस्ते, Support, Website, Helpdesk, Check mail, Mail check pannu, 1 full, 2 full, 3 full, read 1, full 1, show 1 full, Send, Send it, Anupu, Bhejo, Ignore, Ignore all, Skip, Stop, Reply 1, Reply 2, Select 1, Thanks, Tomorrow 11am, Confirm, Reset.'
      );
      formData.append('temperature', '0.0');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Voice Transcriber Warning] Groq Whisper API returned ${response.status}: ${errText}`);
        return '';
      }

      const result = await response.json() as any;
      return (result?.text || '').trim();
    } catch (err: any) {
      console.error('[Voice Transcriber Error]', err.message);
      return '';
    }
  }
}
