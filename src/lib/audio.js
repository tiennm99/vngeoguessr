// Game sound: one AudioContext, one buffer cache, two preferences.
//
// Client-only. Nothing here may be imported from a route handler or from the
// server-side pano modules -- it reaches for window, document and Web Audio.
//
// Playback never throws into a caller. A missing file, a decode failure or a
// browser without Web Audio all mean the same thing to the game: silence.

export const MUSIC_STORAGE_KEY = 'vngeoguessr_music';
export const SFX_STORAGE_KEY = 'vngeoguessr_sfx';

// Effects sit forward; the music is a bed under a panorama the player is
// reading, so it stays well below them.
export const SFX_VOLUME = 0.4;
export const MUSIC_VOLUME = 0.15;

// One file per sound. Nine of them decode once and stay in the cache, which is
// why there is no sprite sheet -- sprites buy a latency win this count does
// not need, at the cost of an offset table to keep in step with the assets.
const SOUNDS = {
  click: '/audio/click.mp3',
  pin: '/audio/pin.mp3',
  submit: '/audio/submit.mp3',
  great: '/audio/great.mp3',
  good: '/audio/good.mp3',
  poor: '/audio/poor.mp3',
  next: '/audio/next.mp3',
  skip: '/audio/skip.mp3',
  error: '/audio/error.mp3',
};

let context = null;
// url -> AudioBuffer, or the in-flight promise for one. Caching the promise is
// what stops two simultaneous plays of the same sound decoding it twice.
const buffers = new Map();
const unlockListeners = new Set();
const musicListeners = new Set();
const sfxListeners = new Set();

// The live answer to "should this play", held in memory and only mirrored into
// localStorage. Storage is a persistence hint, not the source of truth: it
// throws on both read and write in a private window, and a mute read back out
// of a store that refused the write is a mute that never happens.
// theme.js can read on every call because it drives a class name the browser
// then owns; here the value gates playback on every single sound.
let musicEnabled = null;
let sfxEnabled = null;

/**
 * Read a stored on/off flag.
 * @param {string} key Storage key.
 * @returns {boolean} True unless the stored value is exactly 'off'.
 */
function readEnabled(key) {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    // Private browsing and blocked site data both throw here; sound on is the
    // right answer when the choice cannot be read.
    return true;
  }
}

/**
 * Mirror an on/off flag into storage. Best effort by design.
 * @param {string} key Storage key.
 * @param {boolean} enabled Whether the sound should play.
 * @returns {void}
 */
function writeEnabled(key, enabled) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, enabled ? 'on' : 'off');
  } catch {
    // The choice will not survive a reload, but it still applies to this
    // session -- the in-memory flag above is what playback actually reads.
  }
}

/**
 * Whether background music should play.
 * @returns {boolean} True when music is enabled.
 */
export function getStoredMusicEnabled() {
  if (musicEnabled === null) musicEnabled = readEnabled(MUSIC_STORAGE_KEY);
  return musicEnabled;
}

/**
 * Set the music choice, persist it if the browser allows, and tell the player.
 * @param {boolean} enabled Whether music should play.
 * @returns {void}
 */
export function setStoredMusicEnabled(enabled) {
  musicEnabled = enabled;
  writeEnabled(MUSIC_STORAGE_KEY, enabled);
  for (const listener of musicListeners) listener(enabled);
}

/**
 * Whether sound effects should play.
 * @returns {boolean} True when effects are enabled.
 */
export function getStoredSfxEnabled() {
  if (sfxEnabled === null) sfxEnabled = readEnabled(SFX_STORAGE_KEY);
  return sfxEnabled;
}

/**
 * Set the sound-effects choice, persist it if the browser allows, and tell
 * every mounted control.
 * @param {boolean} enabled Whether effects should play.
 * @returns {void}
 */
export function setStoredSfxEnabled(enabled) {
  sfxEnabled = enabled;
  writeEnabled(SFX_STORAGE_KEY, enabled);
  for (const listener of sfxListeners) listener(enabled);
}

/**
 * Watch the music preference. The toggle lives in the header and the player
 * lives in the root layout, so they need a channel that is not React state --
 * and the game header mounts two toggles at once, only one of them visible.
 * @param {Function} onChange Called with the new value on every change.
 * @returns {Function} Unsubscribe.
 */
export function watchMusicPreference(onChange) {
  musicListeners.add(onChange);
  return () => musicListeners.delete(onChange);
}

/**
 * Watch the sound-effects preference.
 * @param {Function} onChange Called with the new value on every change.
 * @returns {Function} Unsubscribe.
 */
export function watchSfxPreference(onChange) {
  sfxListeners.add(onChange);
  return () => sfxListeners.delete(onChange);
}

/**
 * Watch for the audio context opening. The music player mounts before the
 * first gesture, so it cannot start the loop itself -- it waits for this.
 * @param {Function} onUnlock Called once the context is running.
 * @returns {Function} Unsubscribe.
 */
export function watchUnlock(onUnlock) {
  unlockListeners.add(onUnlock);
  return () => unlockListeners.delete(onUnlock);
}

/**
 * Whether audio can play yet.
 * @returns {boolean} True once a user gesture has opened the context.
 */
export function isUnlocked() {
  return context !== null;
}

/**
 * The shared audio context, or null before the first gesture.
 * @returns {AudioContext|null} The context.
 */
export function getAudioContext() {
  return context;
}

/**
 * Open the audio context, or resume one the browser has suspended. Every
 * browser creates it suspended until a user gesture, so the first call must
 * come from inside a real event handler. Idempotent and cheap: the listeners
 * below call it on every gesture for the life of the page.
 * @returns {void}
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;

  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    // A browser with no Web Audio leaves the game silent rather than broken.
    if (!Ctor) return;
    try {
      context = new Ctor();
    } catch {
      // Constructing one can throw where audio is disabled outright. This runs
      // inside a capture-phase document listener, where an escaping error
      // would surface as an uncaught page error.
      return;
    }
    for (const listener of unlockListeners) listener();
  }

  // Backgrounding a tab suspends the context on mobile, and it does not come
  // back on its own -- without this, locking the phone mid-round would leave
  // the game silent for the rest of the session.
  if (context.state === 'suspended') {
    // Safari rejects this when it is not called from a gesture.
    Promise.resolve(context.resume()).catch(() => {});
  }
}

/**
 * Fetch and decode an audio file once, then serve it from memory.
 * @param {string} url Path under /public.
 * @returns {Promise<AudioBuffer>} The decoded buffer.
 */
export function loadAudioBuffer(url) {
  const cached = buffers.get(url);
  if (cached) return cached;

  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`audio ${response.status} for ${url}`);
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .catch((error) => {
      // Drop the rejected promise, or one bad response would keep this sound
      // broken for the rest of the session.
      buffers.delete(url);
      throw error;
    });

  buffers.set(url, pending);
  return pending;
}

/**
 * Play a one-shot. Fire and forget: callers on the game path must never await
 * this, and it resolves whether or not a sound was actually heard.
 * @param {string} name Key of SOUNDS.
 * @param {number} volume Gain, 0 to 1.
 * @returns {Promise<void>} Resolves once the sound has been started, or given up on.
 */
export async function playSound(name, volume = SFX_VOLUME) {
  const url = SOUNDS[name];
  if (!url || !context || !getStoredSfxEnabled()) return;

  try {
    const buffer = await loadAudioBuffer(url);
    // The decode can outlive the choice that allowed it.
    if (!getStoredSfxEnabled()) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    // Nothing else releases these: a long session would otherwise leave one
    // dangling node pair on the destination per sound played.
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  } catch {
    // A missing or undecodable file must not break gameplay.
  }
}

// Unlock on the first gesture anywhere in the document, and keep listening.
// Music is on by default and the first thing a player touches might be the
// name prompt, the region picker or Play, so no single handler can own the
// opening. The listeners stay registered afterwards because unlockAudio is
// also how a context the browser suspended gets resumed -- removing them after
// the first gesture is what silenced the game for the rest of a session once
// the phone had been locked. Capture phase, so a handler that stops
// propagation cannot swallow it.
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);
  // Coming back to a backgrounded tab is not a gesture, but Chrome resumes on
  // it and Safari at least stops refusing.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && context) unlockAudio();
  });
}
