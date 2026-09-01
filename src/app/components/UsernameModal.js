"use client";

import { useEffect, useState } from 'react';
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

// Set or change the leaderboard name. With no saved name yet, the secondary
// action skips into a generated name; when editing an existing name it is a
// plain Cancel, because "skip" would read as discarding the current name.
export default function UsernameModal({ isOpen, onSubmit, onSkip, onClose, initialValue }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const hasExistingName = Boolean(initialValue);

  // Re-seed the field each time the dialog opens: it stays mounted between
  // opens, and an edit session must start from the saved name, not the
  // leftovers of the previous visit.
  useEffect(() => {
    if (isOpen) {
      setUsername(initialValue || '');
      setError('');
    }
  }, [isOpen, initialValue]);

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

    const validUsername = /^[a-zA-Z0-9_-]+$/.test(trimmedUsername);
    if (!validUsername) {
      setError('Username can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    onSubmit(trimmedUsername);
    setError('');
    setUsername('');
  };

  const handleSecondary = () => {
    if (!hasExistingName && onSkip) onSkip();
    else onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center font-bold">
            {hasExistingName ? 'Change your name' : 'Welcome to VNGeoGuessr'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {hasExistingName
              ? 'Pick a new name for the leaderboard'
              : 'Enter a username for the leaderboard'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              Username <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              maxLength={20}
              autoFocus
              required
              autoComplete="username"
              aria-describedby="username-help"
              aria-invalid={error ? true : undefined}
              className="h-11"
            />
            <p id="username-help" className="text-xs text-muted-foreground">
              2-20 characters. Letters, numbers, hyphens and underscores.
            </p>
            {error && (
              <Alert variant="destructive" className="py-2" role="alert" aria-live="assertive">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleSecondary}
              className="flex-1"
            >
              {hasExistingName ? 'Cancel' : 'Skip — random name'}
            </Button>
            <Button
              type="submit"
              className="flex-1"
            >
              Save name
            </Button>
          </div>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Displayed on the leaderboard
        </p>
      </DialogContent>
    </Dialog>
  );
}
