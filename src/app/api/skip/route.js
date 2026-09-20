import { NextResponse } from 'next/server';
import { deleteGameSession } from '../../../lib/session.js';
import { isUuid } from '../../../lib/player-id.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const sessionId = body?.sessionId;

    // Only an id the server could have minted reaches the keyspace. Anything
    // else has nothing to delete, and would otherwise become `session:<value>`
    // with whatever the caller put in it.
    if (!isUuid(sessionId)) {
      return NextResponse.json({
        success: false,
        error: 'Missing or invalid sessionId'
      }, { status: 400 });
    }

    // Clean up the session
    await deleteGameSession(sessionId);

    return NextResponse.json({
      success: true,
      message: 'Session cleaned up'
    });

  } catch (error) {
    console.error('Session cleanup error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to cleanup session'
    }, { status: 500 });
  }
}
