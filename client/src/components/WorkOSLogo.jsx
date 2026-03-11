export default function WorkOSLogo({ size = 36, showText = true, collapsed = false }) {
  const uid = `astly_${size}`;
  const isLarge = size >= 48;

  const titleClass = isLarge
    ? 'text-astra-text font-bold text-2xl tracking-tight'
    : 'text-astra-text font-semibold text-base tracking-tight';

  const subtitleClass = isLarge
    ? 'text-[11px] text-purple-600 font-medium tracking-[0.2em] uppercase'
    : 'text-[9px] text-purple-600 font-medium tracking-[0.18em] uppercase';

  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
          <defs>
            {/* Purple star glow */}
            <radialGradient id={`${uid}_glowP`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </radialGradient>
            {/* Red star glow */}
            <radialGradient id={`${uid}_glowR`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            {/* Blue star glow */}
            <radialGradient id={`${uid}_glowB`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ===== PURPLE STAR (main, center-left, largest) ===== */}
          <circle cx="18" cy="18" r="12" fill={`url(#${uid}_glowP)`} />
          <path d="M18 6 L19.8 14.5 L18 10.5 L16.2 14.5 Z" fill="#c084fc" />
          <path d="M18 30 L19.8 21.5 L18 25.5 L16.2 21.5 Z" fill="#c084fc" />
          <path d="M6 18 L14.5 16.2 L10.5 18 L14.5 19.8 Z" fill="#c084fc" />
          <path d="M30 18 L21.5 19.8 L25.5 18 L21.5 16.2 Z" fill="#c084fc" />
          
          <path
            d="M18 6 L19.6 15.2 L29 18 L19.6 20.8 L18 30 L16.4 20.8 L7 18 L16.4 15.2 Z"
            fill="#a855f7" opacity="0.92"
          />
          <path d="M12 12 L14.5 15.5 M24 12 L21.5 15.5 M12 24 L14.5 20.5 M24 24 L21.5 20.5"
            stroke="#c084fc" strokeWidth="0.5" opacity="0.5" />
          
          <circle cx="18" cy="18" r="2.5" fill="white" opacity="0.95" />
          <circle cx="18" cy="18" r="1.2" fill="#e9d5ff" opacity="0.6" />
          <circle cx="18" cy="5.5" r="0.9" fill="#e9d5ff" opacity="0.8" />
          <circle cx="29.5" cy="18" r="0.7" fill="#e9d5ff" opacity="0.7" />

          {/* ===== RED STAR (bottom-right, medium) ===== */}
          <circle cx="35" cy="34" r="8" fill={`url(#${uid}_glowR)`} />
          <path
            d="M35 26 L36.2 31.8 L42 34 L36.2 36.2 L35 42 L33.8 36.2 L28 34 L33.8 31.8 Z"
            fill="#ef4444" opacity="0.92"
          />
          <circle cx="35" cy="34" r="1.8" fill="white" opacity="0.92" />
          <circle cx="35" cy="34" r="0.8" fill="#fecaca" opacity="0.5" />

          {/* ===== BLUE STAR (top-right, small) ===== */}
          <circle cx="38" cy="10" r="6" fill={`url(#${uid}_glowB)`} />
          <path
            d="M38 4 L39 8.2 L43 10 L39 11.8 L38 16 L37 11.8 L33 10 L37 8.2 Z"
            fill="#3b82f6" opacity="0.92"
          />
          <circle cx="38" cy="10" r="1.3" fill="white" opacity="0.92" />

          {/* Scattered sparkle dots */}
          <circle cx="8" cy="8" r="0.5" fill="#c084fc" opacity="0.4" />
          <circle cx="44" cy="24" r="0.4" fill="#93c5fd" opacity="0.4" />
          <circle cx="26" cy="42" r="0.5" fill="#fca5a5" opacity="0.4" />
        </svg>
      </div>

      {showText && !collapsed && (
        <div className="leading-none flex flex-col">
          <span className={titleClass}>Astly</span>
          <span className={subtitleClass}>Team Flow</span>
        </div>
      )}
    </div>
  );
}
