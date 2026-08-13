import { onUnmounted, ref } from 'vue';
import { postOccupancyPhoto } from '../lib/api';

const CAPTURE_INTERVAL_MS = 5000;

export type CameraOccupancyError = 'permission_denied' | 'analysis_failed';

export function useCameraOccupancy() {
  const videoRef = ref<HTMLVideoElement | null>(null);
  const isMonitoring = ref(false);
  const isAnalyzing = ref(false);
  const latestCount = ref<number | null>(null);
  const error = ref<CameraOccupancyError | null>(null);

  let stream: MediaStream | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const canvas = document.createElement('canvas');

  async function captureAndAnalyze() {
    const video = videoRef.value;
    if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const [, base64] = canvas.toDataURL('image/jpeg', 0.85).split(',');

    isAnalyzing.value = true;
    try {
      const result = await postOccupancyPhoto(base64, 'image/jpeg');
      latestCount.value = result.people_count;
      error.value = null;
    } catch (e) {
      // A single failed cycle doesn't stop monitoring — the next interval retries.
      console.error('Failed to analyze camera frame', e);
      error.value = 'analysis_failed';
    } finally {
      isAnalyzing.value = false;
    }
  }

  async function start() {
    if (isMonitoring.value) return;
    error.value = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
      console.error('Camera permission denied or unavailable', e);
      error.value = 'permission_denied';
      return;
    }

    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      await videoRef.value.play();
    }

    isMonitoring.value = true;
    intervalId = setInterval(captureAndAnalyze, CAPTURE_INTERVAL_MS);
    captureAndAnalyze();
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (videoRef.value) {
      videoRef.value.srcObject = null;
    }
    isMonitoring.value = false;
  }

  onUnmounted(stop);

  return { videoRef, isMonitoring, isAnalyzing, latestCount, error, start, stop };
}
