"use client";

import { useState } from 'react';
import { AlertCircle, Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shareText } from '../../lib/share';

// What the share did, for the screen reader; the visible label carries the
// same word so nothing depends on colour or an icon alone.
const STATUS = {
  shared: 'Shared.',
  copied: 'Copied to the clipboard.',
  failed: 'Sharing failed. Try again.',
};

/**
 * A share button that remembers what the last press did. Unmount it (or give
 * it a new key) to start fresh for a new result.
 * @param {Object} props
 * @param {() => string} props.getText Builds the text at press time.
 * @param {string} props.title Tooltip.
 * @param {string} [props.labelClassName] Classes for the visible word.
 */
export default function ShareButton({ getText, title, labelClassName, ...buttonProps }) {
  const [outcome, setOutcome] = useState(null);
  const label = outcome === 'copied' ? 'Copied' : outcome === 'failed' ? 'Retry' : 'Share';
  const Icon = outcome === 'copied' ? Check : outcome === 'failed' ? AlertCircle : Share2;

  return (
    <>
      <Button
        variant="outline"
        title={title}
        {...buttonProps}
        onClick={async () => setOutcome(await shareText(getText()))}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span className={labelClassName}>{label}</span>
      </Button>
      <p role="status" aria-live="polite" className="sr-only">{STATUS[outcome] ?? ''}</p>
    </>
  );
}
