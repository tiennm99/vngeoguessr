import { NextResponse } from 'next/server';
import { fetchPanoramaById } from '../../../../lib/mapillary.js';
import { debugAccessAllowed, debugForbidden } from '../../../../lib/debug-access.js';

// Resolves a panorama id to a displayable image for the coverage debug page.
// The index only stores ids and coordinates, and thumbnail URLs are signed and
// short-lived, so they have to be fetched when a point is actually opened.
export async function GET(request) {
  // This resolves any image id to its coordinates -- the answer to a live
  // round, for anyone who reads the id off the CDN URL. Closed in production.
  if (!debugAccessAllowed(request)) return debugForbidden();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json(
      { success: false, error: 'A numeric image id is required' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ success: true, pano: await fetchPanoramaById(id) });
  } catch (error) {
    console.error(`Debug panorama lookup failed for ${id}:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 502 });
  }
}
