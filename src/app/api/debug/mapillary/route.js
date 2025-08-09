import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { bbox } = body;

    if (!bbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing bbox parameter' 
      }, { status: 400 });
    }

    // Get Mapillary access token
    const MAPILLARY_ACCESS_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;
    
    if (!MAPILLARY_ACCESS_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: 'Mapillary access token not configured' 
      }, { status: 500 });
    }

    // Validate bbox format
    const coords = bbox.split(',').map(coord => parseFloat(coord.trim()));
    if (coords.length !== 4) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat' 
      }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = coords;
    
    // Validate coordinates
    if (coords.some(coord => isNaN(coord))) {
      return NextResponse.json({ 
        success: false, 
        error: 'All bbox coordinates must be valid numbers' 
      }, { status: 400 });
    }

    console.log(`Testing Mapillary API with bbox: ${bbox}`);

    // Build Mapillary API URL
    const apiUrl = `https://graph.mapillary.com/images?access_token=${MAPILLARY_ACCESS_TOKEN}&fields=id,thumb_original_url,geometry,is_pano&limit=50&bbox=${bbox}`;
    
    const response = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ 
          success: false, 
          error: 'Mapillary authentication failed - check access token' 
        }, { status: 401 });
      }
      return NextResponse.json({ 
        success: false, 
        error: `Mapillary API error: ${response.status} ${response.statusText}` 
      }, { status: response.status });
    }

    const data = await response.json();
    
    // Add some analysis
    const analysis = {
      totalImages: data.data ? data.data.length : 0,
      panoramicImages: data.data ? data.data.filter(img => img.is_pano).length : 0,
      regularImages: data.data ? data.data.filter(img => !img.is_pano).length : 0,
      bboxArea: {
        width: maxLng - minLng,
        height: maxLat - minLat,
        widthKm: ((maxLng - minLng) * 111).toFixed(2),
        heightKm: ((maxLat - minLat) * 111).toFixed(2)
      }
    };

    if (data.data && data.data.length > 0) {
      return NextResponse.json({
        success: true,
        data: data.data,
        analysis,
        apiUrl: apiUrl.replace(MAPILLARY_ACCESS_TOKEN, '[TOKEN_HIDDEN]'), // Hide token in response
        message: `Found ${data.data.length} images in the specified bbox`
      });
    } else {
      return NextResponse.json({
        success: false,
        data: [],
        analysis,
        apiUrl: apiUrl.replace(MAPILLARY_ACCESS_TOKEN, '[TOKEN_HIDDEN]'),
        error: 'No images found in the specified bbox'
      });
    }

  } catch (error) {
    console.error('Debug Mapillary API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error: ' + error.message 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    success: false, 
    error: 'GET method not supported. Use POST with bbox parameter.' 
  }, { status: 405 });
}