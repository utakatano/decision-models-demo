import { digest, sampleTimes, type Frame } from './domain.ts';
function waitEvent(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('動画の読み込みまたはシークがタイムアウトしました。')), 10_000);
    const finish = () => done();
    const fail = () => done(new Error('動画を読み込めませんでした。'));
    const abort = () => done(new DOMException('中止しました', 'AbortError'));
    function done(error?: Error) {
      clearTimeout(timer); video.removeEventListener(event, finish); video.removeEventListener('error', fail); signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    }
    video.addEventListener(event, finish, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
export async function extractFrames(src: string, duration: number, signal: AbortSignal, progress: (n: number) => void): Promise<Frame[]> {
  const video = document.createElement('video');
  video.muted = true; video.preload = 'auto';
  const loaded = waitEvent(video, 'loadeddata', signal); video.src = src;
  try {
    await loaded;
    const ratio = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * ratio); canvas.height = Math.round(video.videoHeight * ratio);
    const context = canvas.getContext('2d');
    if (!context || canvas.width < 1 || canvas.height < 1) throw new Error('画像を抽出できません。');
    const frames: Frame[] = [];
    for (const time of sampleTimes(duration)) {
      if (signal.aborted) throw new DOMException('中止しました', 'AbortError');
      if (time !== video.currentTime) { const sought = waitEvent(video, 'seeked', signal); video.currentTime = time; await sought; }
      // seeked + HAVE_CURRENT_DATA ensure the current decoded frame is available.
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitEvent(video, 'loadeddata', signal);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (signal.aborted) throw new DOMException('中止しました', 'AbortError');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const jpeg = canvas.toDataURL('image/jpeg', 0.85);
      frames.push({ id: `frame-${time}`, time, jpeg, hash: await digest(jpeg) }); progress(frames.length);
    }
    return frames;
  } finally { video.pause(); video.removeAttribute('src'); video.load(); }
}
