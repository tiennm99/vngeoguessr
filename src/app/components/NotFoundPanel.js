import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * The shared body of every 404 in the app.
 *
 * Both not-found routes say the same three things -- what is missing, why it
 * probably happened, and the one way out -- so the layout, spacing and the
 * heading level live here and only the wording differs.
 *
 * A real <h1>, not a styled <p>: a not-found route owns the whole document,
 * unlike GameClient's in-place error panel, which sits inside a page that
 * already has its own heading.
 * @param {Object} props
 * @param {string} props.title Short statement of what is missing.
 * @param {React.ReactNode} props.children The explanation beneath it.
 * @param {string} props.actionLabel Text for the single action.
 * @param {string} props.actionHref Where that action goes.
 */
export default function NotFoundPanel({ title, children, actionLabel, actionHref }) {
  return (
    <div className="flex-1 flex items-center justify-center vn-surface p-6">
      <div className="text-center space-y-4 max-w-sm animate-fade-in-up">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {/* Full-strength foreground, not muted: the panel sits on vn-surface,
            an 82% veil that lets the background art through, where muted
            measures 4.05:1 average and 3.09:1 at its worst in the LIGHT theme
            -- under the 4.5:1 AA needs at this size. (Dark clears it at
            5.8-9.2:1, but the token has to work in both.) This line is the
            only explanation on screen. */}
        <p className="text-foreground text-sm">{children}</p>
        {/* One action, deliberately. A "try again" on a deterministically
            invalid URL is a button guaranteed to reproduce the same page. */}
        <Button asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
