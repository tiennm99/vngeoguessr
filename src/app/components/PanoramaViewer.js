"use client";

import { useEffect, useRef } from 'react';

export default function PanoramaViewer({ imageUrl, onReady, onError }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    let viewer = null;

    const initViewer = async () => {
      if (!containerRef.current) return;
      
      if (!imageUrl) {
        // Show loading or error state
        containerRef.current.innerHTML = `
          <div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; color: white; text-align: center;">
            <div>Loading panoramic image...</div>
          </div>
        `;
        return;
      }

      try {
        // Dynamically import PhotoSphere Viewer and its CSS
        const [{ Viewer }] = await Promise.all([
          import('@photo-sphere-viewer/core'),
          import('@photo-sphere-viewer/core/index.css')
        ]);
        
        // Clean up existing viewer
        if (viewerRef.current) {
          viewerRef.current.destroy();
        }

        // Create new viewer
        viewer = new Viewer({
          container: containerRef.current,
          panorama: imageUrl,
          navbar: ["zoom", "fullscreen"],
          defaultZoomLvl: 0,
          mousewheel: true,
          touchmoveTwoFingers: true,
          loadingImg: null
        });

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
          if (onErrorRef.current) onErrorRef.current(error);
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
      className="w-full h-full min-h-[400px] bg-gray-900 rounded-lg overflow-hidden"
    />
  );
}