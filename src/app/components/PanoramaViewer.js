"use client";

import { useEffect, useRef, memo } from 'react';
import Image from 'next/image';
import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';

function PanoramaViewer({ imageUrl, onReady, onError, topBarSlot }) {
  const containerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  // Kept in refs so a changing callback identity cannot tear down the viewer.
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !imageUrl) return;

    // Each run mounts the viewer on its own child element rather than rewriting
    // the container's innerHTML and looking the node back up by a fixed id.
    // React runs effects twice in development, and the old approach let the
    // second run delete the first viewer's DOM while its texture was still
    // loading: the promise then never settled and never rejected, so the viewer
    // sat on "Loading..." forever with nothing logged.
    const mount = document.createElement('div');
    mount.style.width = '100%';
    mount.style.height = '100%';
    container.appendChild(mount);

    let viewer = null;
    let disposed = false;

    /** Show the panorama flat when the viewer cannot render it. */
    const showFallbackImage = () => {
      if (disposed) return;
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = 'Street view';
      image.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      mount.replaceChildren(image);
    };

    const start = () => {
      if (disposed) return;
      try {
        viewer = new Viewer({
          container: mount,
          panorama: imageUrl,
          loadingImg: null,
          defaultYaw: 0,
          // PSV accepts 0-100; 0 is the widest view. The previous -60 was out
          // of range and only worked because PSV clamps it to this same value.
          defaultZoomLvl: 0,
          navbar: ['zoom', 'fullscreen'],
          mousewheel: true,
          // One finger must rotate the panorama: looking around is the core
          // verb of the game. Two-finger mode only suits a viewer inside a
          // scrolling page, and the game screen no longer scrolls.
          touchmoveTwoFingers: false,
        });

        viewer.addEventListener('ready', () => {
          if (!disposed) onReadyRef.current?.();
        });

        viewer.addEventListener('panorama-error', (event) => {
          console.error('Panorama failed to render, falling back to a flat image:', event);
          showFallbackImage();
          onReadyRef.current?.();
        });
      } catch (error) {
        console.error('Could not create the panorama viewer:', error);
        showFallbackImage();
        onReadyRef.current?.();
        onErrorRef.current?.(error);
      }
    };

    // A timeout rather than an immediate call: development mounts, unmounts and
    // remounts effects back to back, and this lets the throwaway mount cancel
    // before it ever asks the network for the image.
    const startTimer = setTimeout(start, 0);

    return () => {
      // Claim this run's viewer before destroying it, so a late 'ready' from a
      // run that is going away cannot clear the loading state of its successor.
      disposed = true;
      clearTimeout(startTimer);
      try {
        viewer?.destroy();
      } catch (error) {
        console.warn('Error destroying panorama viewer:', error);
      }
      mount.remove();
    };
  }, [imageUrl]);

  return (
    // Fills its parent by insets, so the caller must position it. `h-full`
    // would collapse wherever that parent is a flex item, since a flexed
    // height is indefinite for percentage resolution.
    <div className="absolute inset-0 bg-neutral-900 overflow-hidden touch-none">
      <div ref={containerRef} className="w-full h-full" />
      {/* The pane's top row: the attribution, plus whatever chrome the host
          wants beside it. One flow row rather than two overlays in the same
          corner -- that is how the how-to-play banner ended up covering an
          attribution the Mapillary Terms of Use require to stay visible, and a
          flex row cannot reach that state at all.
          The row itself is click-through so it never eats a panorama drag;
          slot content marks its own opaque parts `pointer-events-auto`. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-(--z-pane-chrome) flex flex-wrap items-start gap-2 p-2">
        {/* Imagery attribution required by the Mapillary Terms of Use: the
            logo, visibly displayed, linking to the Mapillary homepage.
            Deliberately NOT the per-image page — the image id resolves the
            round's answer, and the server keeps it secret. */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md bg-black/50 px-2 py-1">
          <a
            href="https://www.mapillary.com/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Imagery from Mapillary"
          >
            <Image src="/mapillary-logo.svg" alt="Mapillary" width={61} height={14} className="h-3 w-auto" />
          </a>
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] leading-none text-white/80 hover:text-white"
          >
            CC BY-SA 4.0
          </a>
        </div>
        {topBarSlot ? (
          // basis-full below lg: sharing a 375px row with the credit left the
          // slot ~160px, which wrapped a one-sentence hint into five lines. Its
          // own row keeps the full width and still cannot reach the credit.
          <div className="min-w-0 basis-full lg:basis-0 lg:flex-1">{topBarSlot}</div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(PanoramaViewer);
