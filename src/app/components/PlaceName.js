/**
 * A Vietnamese place name inside the English interface.
 *
 * The document is lang="en"; marking the name lang="vi" lets a screen reader
 * switch voice and a browser pick Vietnamese hyphenation and glyph forms, and
 * it is one component to change if names ever get a second script.
 * @param {Object} props
 * @param {import('react').ReactNode} props.children The name.
 * @param {string} [props.className]
 */
export default function PlaceName({ children, className }) {
  return (
    <span lang="vi" className={className}>
      {children}
    </span>
  );
}
