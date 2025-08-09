"use client";

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getUsername } from '../../lib/game';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [currentUsername, setCurrentUsername] = useState('');
  const [userRank, setUserRank] = useState(null);
  const userRowRef = useRef(null);

  useEffect(() => {
    // Get current username
    const username = getUsername();
    if (username) {
      setCurrentUsername(username);
    }
    
    fetchLeaderboard();
    fetchStats();
  }, []);

  // Scroll to user's position when leaderboard loads
  useEffect(() => {
    if (userRowRef.current) {
      userRowRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }, [leaderboard, currentUsername]);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/leaderboard?limit=100');
      const data = await response.json();
      
      if (data.success) {
        setLeaderboard(data.leaderboard);
        
        // Check if current user is in the leaderboard
        if (currentUsername) {
          const userEntry = data.leaderboard.find(entry => entry.username === currentUsername);
          if (userEntry) {
            setUserRank(userEntry.rank);
          } else {
            // User not in top 100, fetch their rank separately
            fetchUserRank(currentUsername);
          }
        }
      } else {
        setError(data.error);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRank = async (username) => {
    try {
      const response = await fetch(`/api/leaderboard?username=${encodeURIComponent(username)}`);
      const data = await response.json();
      
      if (data.success && data.player) {
        setUserRank(data.player.rank);
      }
    } catch (error) {
      console.error('Failed to fetch user rank:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/leaderboard?stats=true');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getScoreColor = (score) => {
    if (score === 5) return 'text-green-600';
    if (score >= 4) return 'text-blue-600';
    if (score >= 3) return 'text-yellow-600';
    if (score >= 2) return 'text-orange-600';
    return 'text-red-600';
  };

  const isCurrentUser = (username) => {
    return currentUsername && username === currentUsername;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
        <div className="min-h-screen bg-black/20 flex items-center justify-center p-4">
          <Card className="w-80">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <Skeleton className="h-12 w-12 rounded-full mx-auto" />
                <Skeleton className="h-4 w-48 mx-auto" />
                <p className="text-muted-foreground">Loading leaderboard...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
      <div className="min-h-screen bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-white text-2xl">🇻🇳</AvatarFallback>
              </Avatar>
              <h1 className="text-2xl font-bold text-white">VNGEOGUESSR</h1>
            </div>
            <Button asChild>
              <Link href="/">Back to Game</Link>
            </Button>
          </header>

          {/* Title and Stats */}
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-4">🏆 Vietnam Leaderboard</h2>
            <div className="text-white/80 text-lg space-y-1">
              {stats && (
                <div>Total Players: {stats.totalEntries} • Highest Score: {stats.topScore}/5</div>
              )}
              {currentUsername && userRank && (
                <Badge variant="secondary" className="bg-yellow-500 text-black font-semibold">
                  Your Rank: #{userRank} {userRank > 100 ? '(100+)' : ''}
                </Badge>
              )}
            </div>
          </div>

          {/* Error State */}
          {error && (
            <Alert variant="destructive" className="mb-8">
              <AlertDescription className="text-center">{error}</AlertDescription>
            </Alert>
          )}

          {/* Leaderboard */}
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-white text-center">Top 100 Players</CardTitle>
            </CardHeader>
            <CardContent>
              
              {leaderboard.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/80 text-lg">No scores yet!</p>
                  <p className="text-white/60 mt-2">Be the first to play and make it to the leaderboard!</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                  {leaderboard.map((entry, index) => (
                    <div 
                      key={entry.username}
                      ref={isCurrentUser(entry.username) ? userRowRef : null}
                      className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                        isCurrentUser(entry.username) 
                          ? 'bg-yellow-500/20 border-2 border-yellow-400 shadow-lg' 
                          : entry.rank <= 3 
                            ? 'bg-white/20 border border-yellow-400/50' 
                            : 'bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-xl font-bold text-white w-12 text-center">
                          {getRankIcon(entry.rank)}
                        </div>
                        <div>
                          <div className={`font-semibold text-lg ${
                            isCurrentUser(entry.username) ? 'text-yellow-300' : 'text-white'
                          }`}>
                            {entry.username}
                            {isCurrentUser(entry.username) && (
                              <Badge className="ml-2 bg-yellow-500 text-black">YOU</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <Badge variant="secondary" className={`text-2xl font-bold ${getScoreColor(entry.score)}`}>
                          {entry.score}/5
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Show message if user is not in top 100 */}
              {currentUsername && userRank && userRank > 100 && (
                <Alert className="mt-4 bg-blue-500/20 border-blue-400/50">
                  <AlertDescription className="text-center">
                    <p className="text-blue-200">
                      <span className="font-semibold">{currentUsername}</span>, you&apos;re ranked #{userRank}!
                    </p>
                    <p className="text-blue-300/80 text-sm mt-1">
                      Keep playing to climb into the top 100!
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="mt-8 flex justify-center">
            <Card className="bg-white/10 backdrop-blur-md border-white/20 max-w-2xl">
              <CardHeader>
                <CardTitle className="text-white text-center">Scoring System</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-white/80 text-sm">
                  <div>0-50m = 5 points ⭐⭐⭐⭐⭐</div>
                  <div>50-100m = 4 points ⭐⭐⭐⭐</div>
                  <div>100-200m = 3 points ⭐⭐⭐</div>
                  <div>200-500m = 2 points ⭐⭐</div>
                  <div>500m-1km = 1 point ⭐</div>
                  <div>1km+ = 0 points</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}