import { getReadinessTone, READINESS_TONE_STYLES } from '@/lib/readiness';

interface ProgressRingProps {
  percent: number;
  size?: number;
  stroke?: number;
  showValue?: boolean;
}

export default function ProgressRing({ percent, size = 44, stroke = 5, showValue = true }: ProgressRingProps) {
  const tone = getReadinessTone(percent);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  const strokeClass = READINESS_TONE_STYLES[tone].stroke;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${strokeClass} transition-[stroke-dashoffset] duration-500`}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-slate-800">
          {percent}%
        </div>
      )}
    </div>
  );
}
