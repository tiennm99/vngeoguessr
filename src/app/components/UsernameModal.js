"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function UsernameModal({ isOpen, onSubmit, onClose }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      setError('Please enter a username');
      return;
    }
    
    if (trimmedUsername.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }
    
    if (trimmedUsername.length > 20) {
      setError('Username must be less than 20 characters');
      return;
    }
    
    // Basic validation - only letters, numbers, and common symbols
    const validUsername = /^[a-zA-Z0-9_-]+$/.test(trimmedUsername);
    if (!validUsername) {
      setError('Username can only contain letters, numbers, hyphens, and underscores');
      return;
    }
    
    onSubmit(trimmedUsername);
    setError('');
    setUsername('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to VNGeoGuessr!</DialogTitle>
          <DialogDescription>
            Enter your username to join the leaderboard
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              maxLength={20}
              autoFocus
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              type="submit"
              className="flex-1"
            >
              Start Playing
            </Button>
          </div>
        </form>
        
        <p className="text-xs text-muted-foreground text-center">
          Your username will be displayed on the leaderboard
        </p>
      </DialogContent>
    </Dialog>
  );
}