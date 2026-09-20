import GameClient from '../components/GameClient';

// Today's daily challenge: one country-wide round, the same panorama for
// everyone, once a day. The round itself comes from /api/daily; this page only
// mounts the game in daily mode.
export const metadata = {
  title: 'Daily Challenge — VNGeoGuessr',
  description: 'One street view, the same for everyone today. Guess where in Vietnam it is.',
  openGraph: {
    title: 'Daily Challenge — VNGeoGuessr',
    description: 'One street view, the same for everyone today. Guess where in Vietnam it is.',
    url: '/daily',
  },
};

export default function DailyPage() {
  return <GameClient region="VN" daily />;
}
