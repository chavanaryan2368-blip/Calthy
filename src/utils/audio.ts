
export async function playPcmBase64(base64Data: string, sampleRate: number = 24000) {
  try {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Gemini TTS returns 16-bit PCM (Little Endian)
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    
    for (let i = 0; i < pcm16.length; i++) {
      // Convert 16-bit Int to 32-bit Float (-1.0 to 1.0)
      float32[i] = pcm16[i] / 32768.0;
    }

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = audioCtx.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    
    return {
      source,
      audioCtx,
      onEnded: (callback: () => void) => {
        source.onended = () => {
          callback();
          audioCtx.close();
        };
      },
      stop: () => {
        source.stop();
        audioCtx.close();
      }
    };
  } catch (error) {
    console.error("Error playing PCM audio:", error);
    return null;
  }
}
