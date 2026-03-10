let approvalAudioContext: AudioContext | null = null;
let approvalAudioUnlocked = false;
let listenersInstalled = false;

function ensureAudioContext(): AudioContext {
  if (!approvalAudioContext) {
    approvalAudioContext = new window.AudioContext();
  }
  return approvalAudioContext;
}

function removeUnlockListeners() {
  if (!listenersInstalled) {
    return;
  }
  listenersInstalled = false;
  window.removeEventListener("pointerdown", unlockApprovalAudio);
  window.removeEventListener("keydown", unlockApprovalAudio);
  window.removeEventListener("touchstart", unlockApprovalAudio);
}

async function unlockApprovalAudio() {
  try {
    const context = ensureAudioContext();
    if (context.state !== "running") {
      await context.resume();
    }
    approvalAudioUnlocked = true;
    removeUnlockListeners();
  } catch {
    approvalAudioUnlocked = false;
  }
}

export function setupApprovalAudioUnlock() {
  if (typeof window === "undefined" || listenersInstalled) {
    return;
  }
  listenersInstalled = true;
  window.addEventListener("pointerdown", unlockApprovalAudio, { passive: true });
  window.addEventListener("keydown", unlockApprovalAudio, { passive: true });
  window.addEventListener("touchstart", unlockApprovalAudio, { passive: true });
}

export function isApprovalAudioReady() {
  return approvalAudioUnlocked;
}

export async function playApprovalArrivalTone(): Promise<boolean> {
  if (!approvalAudioUnlocked || typeof window === "undefined") {
    return false;
  }

  const context = ensureAudioContext();
  if (context.state !== "running") {
    await context.resume();
  }

  const now = context.currentTime;
  const oscillatorA = context.createOscillator();
  const oscillatorB = context.createOscillator();
  const gain = context.createGain();

  oscillatorA.type = "sine";
  oscillatorB.type = "triangle";
  oscillatorA.frequency.setValueAtTime(740, now);
  oscillatorB.frequency.setValueAtTime(1110, now + 0.09);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

  oscillatorA.connect(gain);
  oscillatorB.connect(gain);
  gain.connect(context.destination);

  oscillatorA.start(now);
  oscillatorA.stop(now + 0.11);
  oscillatorB.start(now + 0.09);
  oscillatorB.stop(now + 0.24);

  return true;
}
