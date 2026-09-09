import { afterEach, describe, expect, it, vi } from 'vitest';

// The suite runs in node, so lib/audio.js sees no document at import time and
// registers no gesture listener -- which is itself part of the client-safety
// rule and is asserted below.
//
// lib/audio.js holds each preference in a module-level variable once resolved,
// because storage is unreadable in a private window and playback cannot depend
// on reading it back. That makes the module stateful, so every case loads a
// fresh copy of it rather than sharing one across tests.

// A localStorage stand-in whose reads and writes can be made to throw, which
// is what a private window or blocked site data actually does.
function fakeStorage(failing = null) {
  const store = new Map();
  return {
    getItem(key) {
      if (failing === 'read' || failing === 'both') throw new Error('blocked');
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (failing === 'write' || failing === 'both') throw new Error('blocked');
      store.set(key, String(value));
    },
  };
}

// Enough of the Web Audio API to drive our own control flow: the cache, the
// eviction on failure, the preference gates and the node wiring. The browser's
// implementation is not under test, but the code around it is, and none of it
// runs without something to stand in for a context.
function fakeAudio() {
  const started = [];
  const disconnected = [];

  class FakeContext {
    constructor() {
      this.state = 'suspended';
      this.destination = { name: 'destination' };
      this.resumes = 0;
    }

    resume() {
      this.resumes += 1;
      this.state = 'running';
      return Promise.resolve();
    }

    decodeAudioData() {
      return Promise.resolve({ duration: 1 });
    }

    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        onended: null,
        connect: (next) => next,
        disconnect: () => disconnected.push('source'),
        start: () => started.push(source),
      };
      return source;
    }

    createGain() {
      return {
        gain: { value: null },
        connect: (next) => next,
        disconnect: () => disconnected.push('gain'),
      };
    }
  }

  return { FakeContext, started, disconnected };
}

function okResponse() {
  return { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
}

/**
 * Load a fresh copy of lib/audio.js against a given browser environment.
 * @param {Object} storage localStorage stand-in.
 * @param {Function|null} AudioContextCtor Constructor to expose on window, or null.
 * @returns {Promise<Object>} The module's exports.
 */
async function loadAudio(storage, AudioContextCtor = null) {
  vi.resetModules();
  globalThis.window = AudioContextCtor ? { AudioContext: AudioContextCtor } : {};
  globalThis.localStorage = storage;
  return import('../src/lib/audio.js');
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
  vi.unstubAllGlobals();
});

describe('sound preferences', () => {
  it('defaults both to on when nothing is stored', async () => {
    const audio = await loadAudio(fakeStorage());
    expect(audio.getStoredMusicEnabled()).toBe(true);
    expect(audio.getStoredSfxEnabled()).toBe(true);
  });

  it('round-trips a choice through storage', async () => {
    const audio = await loadAudio(fakeStorage());

    audio.setStoredMusicEnabled(false);
    audio.setStoredSfxEnabled(false);
    expect(audio.getStoredMusicEnabled()).toBe(false);
    expect(audio.getStoredSfxEnabled()).toBe(false);

    audio.setStoredMusicEnabled(true);
    audio.setStoredSfxEnabled(true);
    expect(audio.getStoredMusicEnabled()).toBe(true);
    expect(audio.getStoredSfxEnabled()).toBe(true);
  });

  it('keeps the two choices independent', async () => {
    const audio = await loadAudio(fakeStorage());
    audio.setStoredMusicEnabled(false);
    expect(audio.getStoredSfxEnabled()).toBe(true);
  });

  it('stores the exact values a later page load reads back', async () => {
    const storage = fakeStorage();
    const audio = await loadAudio(storage);

    audio.setStoredMusicEnabled(false);
    audio.setStoredSfxEnabled(true);
    expect(storage.getItem(audio.MUSIC_STORAGE_KEY)).toBe('off');
    expect(storage.getItem(audio.SFX_STORAGE_KEY)).toBe('on');
  });

  it('treats any value other than off as on', async () => {
    const storage = fakeStorage();
    storage.setItem('vngeoguessr_music', 'garbage');
    const audio = await loadAudio(storage);
    expect(audio.getStoredMusicEnabled()).toBe(true);
  });

  it('falls back to on when reading throws', async () => {
    const audio = await loadAudio(fakeStorage('read'));
    expect(audio.getStoredMusicEnabled()).toBe(true);
    expect(audio.getStoredSfxEnabled()).toBe(true);
  });

  it('reports on when there is no window at all', async () => {
    vi.resetModules();
    delete globalThis.window;
    delete globalThis.localStorage;
    const audio = await import('../src/lib/audio.js');
    expect(audio.getStoredMusicEnabled()).toBe(true);
    expect(audio.getStoredSfxEnabled()).toBe(true);
  });

  // The whole reason the module holds these in memory: a private window
  // refuses the write, and reading the flag back would report the mute never
  // happened, leaving the player with no way to silence the game.
  it('honours a choice this session even when the write is refused', async () => {
    const audio = await loadAudio(fakeStorage('both'));

    expect(() => audio.setStoredMusicEnabled(false)).not.toThrow();
    expect(() => audio.setStoredSfxEnabled(false)).not.toThrow();
    expect(audio.getStoredMusicEnabled()).toBe(false);
    expect(audio.getStoredSfxEnabled()).toBe(false);
  });
});

describe('preference subscriptions', () => {
  it('notifies music and effects watchers with the new value', async () => {
    const audio = await loadAudio(fakeStorage());
    const music = [];
    const sfx = [];
    const unwatchMusic = audio.watchMusicPreference((on) => music.push(on));
    const unwatchSfx = audio.watchSfxPreference((on) => sfx.push(on));

    audio.setStoredMusicEnabled(false);
    audio.setStoredSfxEnabled(false);
    audio.setStoredMusicEnabled(true);
    expect(music).toEqual([false, true]);
    expect(sfx).toEqual([false]);

    unwatchMusic();
    unwatchSfx();
    audio.setStoredMusicEnabled(false);
    audio.setStoredSfxEnabled(true);
    expect(music).toEqual([false, true]);
    expect(sfx).toEqual([false]);
  });

  // Two SoundToggles are mounted at once in the game header, one of them
  // display:none. Both must hear about a change the other made.
  it('notifies every watcher, not just the first', async () => {
    const audio = await loadAudio(fakeStorage());
    const seen = [];
    audio.watchSfxPreference(() => seen.push('a'));
    audio.watchSfxPreference(() => seen.push('b'));

    audio.setStoredSfxEnabled(false);
    expect(seen).toEqual(['a', 'b']);
  });

  it('notifies even when the write is refused', async () => {
    const audio = await loadAudio(fakeStorage('write'));
    const seen = [];
    audio.watchMusicPreference((on) => seen.push(on));

    audio.setStoredMusicEnabled(false);
    expect(seen).toEqual([false]);
  });
});

describe('unlockAudio', () => {
  it('stays locked and requests nothing before a gesture', async () => {
    const audio = await loadAudio(fakeStorage(), fakeAudio().FakeContext);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(audio.isUnlocked()).toBe(false);
    await audio.playSound('click');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('opens the context once and tells its watchers', async () => {
    const { FakeContext } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    let opened = 0;
    audio.watchUnlock(() => { opened += 1; });

    audio.unlockAudio();
    const first = audio.getAudioContext();
    audio.unlockAudio();

    expect(audio.isUnlocked()).toBe(true);
    expect(audio.getAudioContext()).toBe(first);
    expect(opened).toBe(1);
  });

  // A backgrounded tab suspends the context on mobile and it does not come
  // back on its own, so every later gesture has to try again.
  it('resumes a context the browser suspended', async () => {
    const { FakeContext } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);

    audio.unlockAudio();
    const context = audio.getAudioContext();
    expect(context.resumes).toBe(1);

    context.state = 'suspended';
    audio.unlockAudio();
    expect(context.resumes).toBe(2);
  });

  it('stays silent rather than throwing when the context cannot be built', async () => {
    class Hostile {
      constructor() {
        throw new Error('audio disabled');
      }
    }
    const audio = await loadAudio(fakeStorage(), Hostile);

    expect(() => audio.unlockAudio()).not.toThrow();
    expect(audio.isUnlocked()).toBe(false);
  });

  it('stays silent on a browser with no Web Audio', async () => {
    const audio = await loadAudio(fakeStorage(), null);
    expect(() => audio.unlockAudio()).not.toThrow();
    expect(audio.isUnlocked()).toBe(false);
  });
});

describe('playSound', () => {
  it('fetches and decodes a sound once, however often it plays', async () => {
    const { FakeContext, started } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    const fetchSpy = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal('fetch', fetchSpy);
    audio.unlockAudio();

    await audio.playSound('pin');
    await audio.playSound('pin');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/audio/pin.mp3');
    expect(started).toHaveLength(2);
  });

  it('releases its nodes when the sound ends', async () => {
    const { FakeContext, started, disconnected } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
    audio.unlockAudio();

    await audio.playSound('click');
    started[0].onended();
    expect(disconnected).toEqual(['source', 'gain']);
  });

  // A cached rejection would keep one sound broken for the whole session.
  it('retries a sound whose first fetch failed', async () => {
    const { FakeContext, started } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchSpy);
    audio.unlockAudio();

    await audio.playSound('error');
    expect(started).toHaveLength(0);

    await audio.playSound('error');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(started).toHaveLength(1);
  });

  it('swallows a fetch that rejects outright', async () => {
    const { FakeContext } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    audio.unlockAudio();

    await expect(audio.playSound('next')).resolves.toBeUndefined();
  });

  it('plays nothing while effects are muted', async () => {
    const { FakeContext, started } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    const fetchSpy = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal('fetch', fetchSpy);
    audio.unlockAudio();
    audio.setStoredSfxEnabled(false);

    await audio.playSound('submit');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(started).toHaveLength(0);
  });

  // The regression that finding #1 described: with storage refusing writes, a
  // mute used to be unreadable and every sound kept playing.
  it('stays muted in a private window', async () => {
    const { FakeContext, started } = fakeAudio();
    const audio = await loadAudio(fakeStorage('both'), FakeContext);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
    audio.unlockAudio();
    audio.setStoredSfxEnabled(false);

    await audio.playSound('great');
    expect(started).toHaveLength(0);
  });

  it('ignores a name that is not a sound, even once unlocked', async () => {
    const { FakeContext, started } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    const fetchSpy = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal('fetch', fetchSpy);
    audio.unlockAudio();

    await expect(audio.playSound('not-a-sound')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(started).toHaveLength(0);
  });

  it('plays every sound the game wires up', async () => {
    const { FakeContext, started } = fakeAudio();
    const audio = await loadAudio(fakeStorage(), FakeContext);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
    audio.unlockAudio();

    const names = ['click', 'pin', 'submit', 'great', 'good', 'poor', 'next', 'skip', 'error'];
    for (const name of names) await audio.playSound(name);
    expect(started).toHaveLength(names.length);
  });
});
