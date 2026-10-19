export function NitroGauge({
  value,
  boosting,
}: {
  value: number;
  boosting: boolean;
}) {
  const percent = Math.max(0, Math.min(100, value)),
    circumference = 2 * Math.PI * 43;
  return (
    <div
      className={`nitro-gauge ${boosting ? "boosting" : ""}`}
      role="meter"
      aria-label="Nitrous charge"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle className="nitro-halo" cx="55" cy="55" r="50" />
        <circle className="nitro-face" cx="55" cy="55" r="43" />
        <circle
          className="nitro-progress"
          cx="55"
          cy="55"
          r="43"
          strokeDasharray={`${(circumference * 0.8 * percent) / 100} ${circumference}`}
          transform="rotate(126 55 55)"
        />
        <circle className="nitro-inner" cx="55" cy="55" r="36" />
      </svg>
      <div className="nitro-label">
        <span>NITRO</span>
        <strong>
          {Math.round(percent)}
          <small>%</small>
        </strong>
      </div>
    </div>
  );
}
