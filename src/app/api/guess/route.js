import { NextResponse } from 'next/server';
import { submitRoundScore, submitDistanceRecord } from '../../../lib/leaderboard.js';
import { getGameSession, deleteGameSession } from '../../../lib/session.js';
import { calculateDistance, calculateScore } from '../../../lib/game.js';
import { publicRegion } from '../../../lib/region-request.js';
import { validateUsername } from '../../../lib/username.js';
import { locateRegion, regionHit } from '../../../lib/region-locate.js';
import { getRegion, isRegion } from '../../../lib/regions.js';
import { readPlayerId } from '../../../lib/player-id.js';
import { recordRound } from '../../../lib/stats.js';

/** A 400 with a machine-readable reason the client can turn into the right copy. */
function reject(error, reason) {
  return NextResponse.json({ success: false, error, reason }, { status: 400 });
}

/**
 * A coordinate from the request body, or NaN for anything that is not a number
 * or a numeric string. Number(null) and Number(true) are 0 and 1, which would
 * otherwise pass as a point in the Gulf of Guinea.
 * @param {unknown} value
 * @returns {number}
 */
function toCoordinate(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

/**
 * Record the distance boards, tolerating a store failure.
 *
 * Runs after the session is consumed, so a throw here cannot be retried: the
 * score boards may already hold this round. Reporting a 500 then would tell the
 * player nothing was recorded while their points sit on the board. The distance
 * boards are the lesser record, so they are the ones allowed to go missing.
 */
async function distanceOrNone(username, distance, regionCode) {
  try {
    return await submitDistanceRecord(username, distance, regionCode);
  } catch (error) {
    console.error('Distance record failed after scoring:', error);
    return null;
  }
}

/** Count the round in the daily statistics, tolerating a store failure. */
async function recordRoundOrIgnore(level, score, playerId) {
  try {
    await recordRound(level, score, playerId);
  } catch (error) {
    console.error('Round statistics failed:', error);
  }
}

export async function POST(request) {
  try {
    // A malformed body is the caller's mistake, not a server failure.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return reject('Request body must be JSON', 'invalid-request');
    }
    const { username: rawUsername, guessLat, guessLng, sessionId } = body;

    if (!sessionId || guessLat === undefined || guessLng === undefined) {
      return reject('Missing required fields: username, sessionId, guess coordinates', 'invalid-request');
    }

    // The same rule the name prompt enforces, applied where it counts: this
    // string becomes a sorted-set member on every board it touches.
    const checked = validateUsername(rawUsername);
    if (!checked.ok) return reject(checked.error, 'invalid-username');
    const username = checked.value;

    // Finite and in range. Math.abs(NaN) > 90 is false, so a range check alone
    // let "abc" through to the distance calculation.
    const numGuessLat = toCoordinate(guessLat);
    const numGuessLng = toCoordinate(guessLng);
    if (!Number.isFinite(numGuessLat) || Math.abs(numGuessLat) > 90) {
      return reject('Invalid latitude values', 'invalid-guess');
    }
    if (!Number.isFinite(numGuessLng) || Math.abs(numGuessLng) > 180) {
      return reject('Invalid longitude values', 'invalid-guess');
    }

    // Get session data from Redis
    const session = await getGameSession(sessionId);
    if (!session) {
      return reject('Session not found or expired', 'session-expired');
    }

    // Get target coordinates from session
    const numTargetLat = Number(session.exactLocation?.lat);
    const numTargetLng = Number(session.exactLocation?.lng);
    if (!Number.isFinite(numTargetLat) || !Number.isFinite(numTargetLng)) {
      throw new Error(`Session ${sessionId} holds no usable target location`);
    }

    // Calculate distance between guess and target (server-side)
    const distance = calculateDistance(
      numGuessLat, numGuessLng,
      numTargetLat, numTargetLng
    );

    // One ladder for every region: the same distance is worth the same points
    // whether the player picked a district or the whole country.
    const finalScore = calculateScore(distance);

    // The region the panorama was actually in, resolved server-side when the
    // round was created. Never read from the request: a client that could name
    // its own region could farm any district's board.
    const scoringRegion = session.regionCode;

    // Claim the session before writing, and score only if this request is the
    // one that removed it. DEL is atomic, so exactly one of N concurrent
    // submits wins; reading the session and deleting it without checking the
    // result lets every one of them through, because they all read it alive.
    //
    // Consuming first also closes the sequential case: a failure partway
    // through the fan-out would otherwise leave the session alive for up to 30
    // minutes and a retry would re-credit every level that already succeeded.
    const consumed = await deleteGameSession(sessionId);
    if (!consumed) {
      return reject('Session already submitted or expired', 'session-consumed');
    }

    // Boards are credited per level from the raw distance against the same
    // ladder, so every level records the identical points for this round. The
    // two fan-outs touch disjoint keys, so they run together.
    //
    // Not for the daily. Its panorama is the same all day and the answer is in
    // this very response, so a daily session that credited boards would be
    // five points on three permanent boards for two requests, all day long.
    // The daily is scored and counted, never credited.
    const isDaily = session.mode === 'daily';
    const [leaderboardResult, distanceResult] = isDaily
      ? [{ levels: [], partial: false }, null]
      : await Promise.all([
          submitRoundScore(username, distance, scoringRegion),
          distanceOrNone(username, distance, scoringRegion),
        ]);

    // Where the guess landed, against where the panorama was. Display only:
    // it changes no score, but it turns "0 points" into "right province,
    // wrong district" for a round the ladder cannot grade.
    const guessedRegion = locateRegion(numGuessLat, numGuessLng);
    const hit = regionHit(guessedRegion, scoringRegion);

    // Counted by the level the player chose to play, which is what decides how
    // hard the round was.
    const pickedLevel = isRegion(session.pickedRegion)
      ? getRegion(session.pickedRegion).level
      : 'country';
    // A daily round is a country round everyone plays; counted apart so the
    // two are not confused in the zero-score share.
    const statsLevel = isDaily ? 'daily' : pickedLevel;
    await recordRoundOrIgnore(statsLevel, finalScore, readPlayerId(request));

    // For monitoring. Deliberately without the name or either coordinate pair:
    // the logs are not a second copy of who guessed where.
    console.log('Game submission:', {
      region: scoringRegion,
      distance: `${distance}m`,
      score: finalScore,
      hit,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      gameResult: {
        distance,
        score: finalScore,
        // One entry per level credited, outermost last. The client renders
        // these directly rather than a fixed global/city pair.
        levels: leaderboardResult.levels,
        // True when a level failed to write after the session was consumed:
        // the levels above are what actually landed.
        partial: Boolean(leaderboardResult.partial),
        distanceLevels: distanceResult?.levels ?? [],
        // Where the panorama actually was. Safe now, and only now: the guess
        // is in.
        region: publicRegion(scoringRegion),
        // Where the guess was, and how much of the answer's region it shares.
        guessedRegion: guessedRegion ? publicRegion(guessedRegion) : null,
        hit,
        exactLocation: {
          lat: numTargetLat,
          lng: numTargetLng
        }
      },
    });

  } catch (error) {
    console.error('Submit Guess Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process game result',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'GET method not supported for game submissions'
  }, { status: 405 });
}
