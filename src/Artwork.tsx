import { hash } from "./model";
const palettes = [
  ["#28223c", "#b57871", "#e7b88d"],
  ["#143034", "#649b8b", "#d7d49c"],
  ["#202d48", "#6684ae", "#c8bba6"],
  ["#492c29", "#cc7758", "#f1c28b"],
  ["#262b32", "#8e9b9b", "#c7d1c7"],
  ["#312948", "#927ca6", "#d1b7ad"],
];
export default function Artwork({
  title,
  wide = false,
}: {
  title: string;
  wide?: boolean;
}) {
  const n = hash(title),
    [dark, mid, light] = palettes[n % palettes.length];
  const id = `art-${n}-${wide ? "wide" : "tall"}`;
  return (
    <svg
      className="artwork"
      viewBox={wide ? "0 0 960 440" : "0 0 360 480"}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x2="0" y2="1">
          <stop stopColor={dark} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor={light} stopOpacity=".55" />
          <stop offset="1" stopColor={light} stopOpacity="0" />
        </radialGradient>
        <pattern
          id={`${id}-grain`}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r=".55" fill="#fff" opacity=".12" />
        </pattern>
      </defs>
      <rect width="960" height="600" fill={`url(#${id})`} />
      <ellipse
        cx={wide ? 710 : 250}
        cy="160"
        rx="260"
        ry="210"
        fill={`url(#${id}-glow)`}
      />
      {n % 3 === 0 ? (
        <>
          <circle
            cx={wide ? 720 : 245}
            cy="150"
            r="78"
            fill={light}
            opacity=".8"
          />
          <ellipse
            cx={wide ? 720 : 245}
            cy="150"
            rx="130"
            ry="20"
            fill="none"
            stroke={light}
            strokeWidth="2"
            transform={`rotate(-25 ${wide ? 720 : 245} 150)`}
            opacity=".65"
          />
          <path
            d={
              wide
                ? "M0 400 180 250 340 360 520 290 680 375 820 280 960 360V600H0Z"
                : "M0 350 100 270 170 330 260 250 360 330V600H0Z"
            }
            fill={dark}
          />
        </>
      ) : n % 3 === 1 ? (
        <>
          <circle
            cx={wide ? 730 : 240}
            cy="155"
            r="53"
            fill={light}
            opacity=".75"
          />
          {Array.from({ length: wide ? 14 : 8 }, (_, i) => (
            <path
              key={i}
              d={`M${i * 80 - 30} 530 L${i * 80 + 15} ${200 + (i % 3) * 45} L${i * 80 + 60} 530Z`}
              fill={dark}
              opacity={0.4 + (i % 3) * 0.2}
            />
          ))}
          <path d="M0 410 Q180 360 360 430T960 410V600H0Z" fill={dark} />
        </>
      ) : (
        <>
          <circle
            cx={wide ? 720 : 230}
            cy="150"
            r="66"
            fill={light}
            opacity=".72"
          />
          <path d="M0 320Q140 260 290 340T580 330T960 280V600H0Z" fill={mid} />
          <path
            d="M0 390Q200 330 400 400T800 360L960 370V600H0Z"
            fill={dark}
            opacity=".65"
          />
          <path d="M0 450Q150 390 360 440T780 420T960 430V600H0Z" fill={dark} />
        </>
      )}
      <rect width="960" height="600" fill={`url(#${id}-grain)`} />
    </svg>
  );
}
