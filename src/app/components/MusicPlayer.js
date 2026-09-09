"use client";

import { useEffect, useRef } from 'react';
import {
  MUSIC_VOLUME,
  getStoredMusicEnabled,
  isUnlocked,
  getAudioContext,
  loadAudioBuffer,
  watchMusicPreference,
  watchUnlock,
} from '../../lib/audio';

/**
 * Pick the loop the browser can actually decode.
 *
 * Safari only decodes Opus in WebM from 18.4, so an MP3 of the same loop ships
 * beside it. MP3 carries encoder padding that decodeAudioData renders as
 * silence, which puts a short gap at the loop point -- only the browsers that
 * cannot take the WebM pay for it.
 * @returns {string} Path to the loop file.
 */
function pickSource() {
  const probe = document.createElement('audio');
  return probe.canPlayType('audio/webm; codecs="opus"') !== ''
    ? '/audio/music.webm'
    : '/audio/music.mp3';
}

/**
 * The background loop. Renders nothing, and is mounted once in the root layout
 * rather than per page: `/` to `/game/[region]` is a client navigation, so a
 * player mounted inside either page would tear down and restart the loop on
 * every move between them.
 * @returns {null} Nothing to render.
 */
export default function MusicPlayer() {
  // A playing audio node is not render state, so none of this lives in
  // useState -- re-rendering the root layout to track a loop would be waste.
  const sourceRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const stop = () => {
      const source = sourceRef.current;
      // Cleared before stop(), so a start() racing this cannot see a node that
      // is on its way out and decide one is already playing.
      sourceRef.current = null;
      if (!source) return;
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped; nothing left to do.
      }
    };

    const start = async () => {
      if (sourceRef.current || !isUnlocked() || !getStoredMusicEnabled()) return;
      const context = getAudioContext();
      if (!context) return;

      try {
        const buffer = await loadAudioBuffer(pickSource());
        // The decode can outlive the mount, or the player can be muted while
        // it runs; either way the node must not reach the speakers.
        if (!aliveRef.current || sourceRef.current || !getStoredMusicEnabled()) return;

        const source = context.createBufferSource();
        source.buffer = buffer;
        // Looping a decoded buffer returns to sample zero, so the seam is
        // sample-accurate -- which an <audio loop> element cannot promise
        // because the container framing rides along with it.
        source.loop = true;
        const gain = context.createGain();
        gain.gain.value = MUSIC_VOLUME;
        source.connect(gain).connect(context.destination);
        source.start();
        sourceRef.current = source;
      } catch {
        // A missing or undecodable loop leaves the game silent, not broken.
      }
    };

    // Two ways in: the context opening on the first gesture, and the player
    // flipping the switch afterwards.
    const unwatchUnlock = watchUnlock(start);
    const unwatchPreference = watchMusicPreference((enabled) => {
      if (enabled) start();
      else stop();
    });

    // A gesture may already have landed before this mounted -- a click on the
    // name prompt, say, on a page that then navigated here.
    start();

    return () => {
      aliveRef.current = false;
      unwatchUnlock();
      unwatchPreference();
      stop();
    };
  }, []);

  return null;
}
