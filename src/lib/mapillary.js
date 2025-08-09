// Mapillary API utilities

// Fetch images with retry logic using different radii
export async function fetchMapillaryImages(lat, lng, accessToken, maxRetries = 3) {
  const radii = [1, 2, 5]; // km
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const radiusKm = radii[attempt];
    const delta = radiusKm / 111; // Rough conversion: 1 degree ≈ 111 km
    
    const bbox = [
      (lng - delta).toFixed(6),
      (lat - delta).toFixed(6),
      (lng + delta).toFixed(6),
      (lat + delta).toFixed(6)
    ].join(',');
    
    console.log(`Attempt ${attempt + 1}: Searching within ${radiusKm}km radius`);
    
    const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_original_url,geometry,is_pano&limit=10&bbox=${bbox}&is_pano=true`;
    
    try {
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 0 }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Mapillary authentication failed');
        }
        throw new Error(`Mapillary API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        console.log(`Found ${data.data.length} images within ${radiusKm}km radius`);
        return {
          success: true,
          data: data.data,
          radiusUsed: radiusKm,
          attempt: attempt + 1
        };
      }
      
      console.log(`No images found within ${radiusKm}km radius, trying larger radius...`);
      
    } catch (error) {
      console.error(`Error in attempt ${attempt + 1}:`, error);
      if (attempt === maxRetries - 1) {
        throw error;
      }
    }
  }
  
  return {
    success: false,
    error: 'No street view images found in any search radius'
  };
}