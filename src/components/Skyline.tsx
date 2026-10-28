/** London at dusk: the Eye, Elizabeth Tower, the Shard and rooftops with lit windows. */
export function Skyline({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 ${className}`} style={{ background: "radial-gradient(60% 90% at 70% 85%, rgb(255 170 110 / 0.75), transparent 60%), radial-gradient(80% 70% at 15% 0%, rgb(110 90 160 / 0.7), transparent 70%), linear-gradient(180deg, #2c2546 0%, #6a4660 48%, #d08a62 82%, #f0b07c 100%)" }}>
      <svg viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[70%] w-full" aria-hidden>
        <g fill="none" stroke="#2a1f2e" strokeOpacity="0.7" strokeWidth="2.2">
          <circle cx="905" cy="140" r="70" />
          {Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return <line key={i} x1="905" y1="140" x2={(905 + Math.cos(a) * 70).toFixed(1)} y2={(140 + Math.sin(a) * 70).toFixed(1)} />; })}
        </g>
        <path fill="#22192a" d="M0 260V205h35v-18h28v28h22v-36h18v36h28v-22h30v32h36v-26l9-9 9 9v26h26V190h22v18h36V150h11v-50l7-28 7 28v50h11v40h45v-18h32v28h40v-50h16V115h9l5-18 5 18h9v34h16v56h36v-32h36v18h50l64-170 20 170h28v-28h36v36h46v-46h18v-22h28v22h18v46h36v-18h40v32h46v-55h22v55h36v-22h36v32h28V260z" />
        <g fill="#ffcf8a" opacity="0.85">
          {Array.from({ length: 90 }, (_, i) => <rect key={i} x={(i * 97) % 1180 + 10} y={212 + ((i * 37) % 44)} width="3" height="4" />)}
        </g>
      </svg>
    </div>
  );
}
