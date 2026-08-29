"use client";

import { useEffect, useRef, memo } from 'react';
import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';

function PanoramaViewer({ imageUrl, onReady, onError }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  console.log('PanoramaViewer render - imageUrl:', imageUrl);

  useEffect(() => {
    console.log('PanoramaViewer useEffect triggered - imageUrl:', imageUrl);
    console.log('Container ref:', containerRef.current);
    
    let viewer = null;

    const initViewer = async () => {
      console.log('initViewer called');
      if (!containerRef.current) {
        console.error('Container ref is null');
        return;
      }
      
      if (!imageUrl) {
        // Show loading or error state
        containerRef.current.innerHTML = `
          <div role="status" aria-live="polite" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; color: white; text-align: center;">
            <div>Loading panoramic image...</div>
          </div>
        `;
        return;
      }

      console.log('Initializing PhotoSphere Viewer with URL:', imageUrl);
      console.log('Container element:', containerRef.current);

      try {
        // Clean up existing viewer
        if (viewerRef.current) {
          viewerRef.current.destroy();
        }

        // Set up container with id for PhotoSphere Viewer
        containerRef.current.innerHTML = '<div id="pano" style="width:100%; height:100%;"></div>';
        
        console.log('Creating PhotoSphere Viewer...');
        
        // Create new viewer with your specified config
        viewer = new Viewer({
          container: document.getElementById("pano"),
          panorama: imageUrl,
          loadingImg: null,
          defaultYaw: 0,
          defaultZoomLvl: -60,
          navbar: ["zoom", "fullscreen"],
          mousewheel: true,
          touchmoveTwoFingers: true
        });
        
        console.log('PhotoSphere Viewer created successfully');

        viewer.addEventListener('ready', () => {
          console.log("PhotoSphere Viewer loaded successfully");
          if (onReadyRef.current) onReadyRef.current();
        });

        viewer.addEventListener('panorama-loaded', () => {
          console.log("Panorama image loaded");
          if (onReadyRef.current) onReadyRef.current();
        });

        viewer.addEventListener('panorama-error', (error) => {
          console.error("Error loading panorama:", error);
          // Fallback to regular image on panorama error
          if (containerRef.current) {
            containerRef.current.innerHTML = `
              <img 
                src="${imageUrl}" 
                style="width:100%; height:100%; object-fit:cover; border-radius:10px;" 
                alt="Street view" 
                onload="console.log('Fallback image loaded successfully')"
                onerror="console.error('Both panorama and fallback image failed to load')"
              />
            `;
            if (onReadyRef.current) onReadyRef.current();
          }
        });

        // Also handle general errors
        viewer.addEventListener('error', (error) => {
          console.error("PhotoSphere Viewer error:", error);
          if (onErrorRef.current) onErrorRef.current(error);
        });

        viewerRef.current = viewer;

      } catch (error) {
        console.error('Error initializing PhotoSphere Viewer:', error);
        
        // Fallback to regular image
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <img 
              src="${imageUrl}" 
              style="width:100%; height:100%; object-fit:cover; border-radius:10px;" 
              alt="Street view" 
            />
          `;
          
          if (onReadyRef.current) onReadyRef.current();
        }
        
        if (onErrorRef.current) onErrorRef.current(error);
      }
    };

    initViewer();

    // Cleanup function
    return () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch (error) {
          console.warn('Error destroying viewer:', error);
        }
        viewerRef.current = null;
      }
    };
  }, [imageUrl]); // Remove onReady and onError from deps to prevent constant reinitialization

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full min-h-[400px] bg-neutral-900 rounded-lg overflow-hidden"
    />
  );
}

export default memo(PanoramaViewer);