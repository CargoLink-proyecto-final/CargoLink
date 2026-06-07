import { Star } from 'lucide-react';

interface Props {
  score: number;
  size?: number;
}

export default function RatingStars({ score, size = 14 }: Props) {
  const rounded = Math.round(score);
  return (
    <div className="flex items-center gap-0.5" aria-label={`${score} estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={
            i <= rounded ? 'fill-warning-500 text-warning-500' : 'text-ink-300'
          }
        />
      ))}
    </div>
  );
}
