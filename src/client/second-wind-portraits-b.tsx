import type { ReactNode } from 'react';

// Hand-authored flat portraits; silhouettes and signature props follow the
// Second Wind references, using the original project's bold ink vocabulary.
const ink = '#191919', paper = '#fffdf4', yellow = '#ffda27', orange = '#f19a2b', pink = '#ef83b6', purple = '#8656a4', blue = '#478ac4', green = '#168a55', olive = '#a6a34c', cream = '#dfe5cb', brown = '#a07b46';
function Eyes({ x = 47, y = 50, gap = 22, rx = 7, ry = 9, look = 2 }: { x?: number; y?: number; gap?: number; rx?: number; ry?: number; look?: number }) {
  return <g fill={paper}><ellipse cx={x} cy={y} rx={rx} ry={ry} /><ellipse cx={x + gap} cy={y - 2} rx={rx} ry={ry} /><g fill={ink} stroke="none"><ellipse cx={x + look} cy={y + 1} rx="2.7" ry="3.7" /><ellipse cx={x + gap + look} cy={y - 1} rx="2.7" ry="3.7" /></g></g>;
}
function Die({ x, y, color, angle = 0 }: { x: number; y: number; color: string; angle?: number }) { return <g transform={`translate(${x} ${y}) rotate(${angle})`}><rect x="-9" y="-9" width="18" height="18" rx="2" fill={color} /><g fill={ink} stroke="none"><circle cx="-4" cy="-4" r="1.9" /><circle cx="4" cy="4" r="1.9" /><circle r="1.9" /></g></g>; }

export const SECOND_WIND_PORTRAITS_B: Record<string, ReactNode> = {
  kraken: <>
    <g fill={pink}>
      <path d="M47 48C36 33 17 43 12 30 7 17 25 11 29 23c3 8-7 11-9 5 13 18 29-3 41 15z" />
      <path d="M72 48c12-15 29-6 31-20 2-11-12-14-15-5-2 6 5 9 8 4-7 17-25 1-34 16z" />
      <path d="M45 66C29 48 9 57 10 74c1 12 16 12 19 4 2-6-5-9-8-4 2-15 17-1 24 5z" />
      <path d="M76 65c16-17 32-9 34 5 2 12-10 16-15 10-4-4 0-10 5-7-6-12-16 1-22 7z" />
      <path d="M48 78c-15-2-23 9-19 23 4 15 18 10 16 2-1-5-6-6-9-2-1-10 8-10 16-9z" />
      <path d="M70 78c15-3 26 6 24 20-3 17-19 16-19 6 0-6 7-7 9-2 2-10-8-12-17-10z" />
      <path d="M52 80c-9 4-7 19-19 16-12-3-17 8-7 13 8 4 12-3 7-6 17 6 23-9 26-18z" />
      <path d="M65 81c8 5 7 18 18 16 12-1 17 8 8 13-7 4-13-1-8-5-18 2-20-11-23-20z" />
      <path d="M61 15C47 25 36 44 39 65c0 18 11 27 24 24 22-1 27-23 15-43L69 24z" />
    </g>
    <path d="m61 15 8 9 6 14q-12 1-17-9z" fill={cream} />
    <Eyes x={51} y={68} gap={22} rx={8} ry={9} look={-2} /><path d="m43 59 16 4m6-2 16-7M55 82q9-6 17-1" fill="none" />
    <g fill={purple} strokeWidth="1.6"><ellipse cx="13" cy="68" rx="3" ry="4" /><ellipse cx="21" cy="60" rx="3" ry="4" /><ellipse cx="103" cy="64" rx="3" ry="4" /><ellipse cx="100" cy="33" rx="3" ry="4" /><ellipse cx="31" cy="94" rx="3" ry="4" /><ellipse cx="88" cy="94" rx="3" ry="4" /><ellipse cx="43" cy="100" rx="3" ry="4" /><ellipse cx="76" cy="101" rx="3" ry="4" /></g>
  </>,
  'le-saboteur': <>
    <path d="M28 79q29-13 59-2l11 33H22z" fill={paper} /><path d="m26 88 66-1m-70 14h74" stroke={ink} strokeWidth="9" />
    <path d="M35 33q1-19 20-18l21 3q13 5 12 19 24-3 22 13 0 22-40 27-43 2-41-22z" fill={green} />
    <path d="M35 32q-5-17 12-24 13-5 25 5L54 27z" fill={ink} /><path d="m55 9 1-4 6 1" fill="none" />
    <Eyes x={61} y={28} gap={23} rx={7} ry={9} look={-2} /><path d="m54 23 13-4m12 1 11 2" fill="none" />
    <path d="M40 49q25 22 61 6-4 17-32 17-18 0-29-23z" fill="#ed4f36" /><path d="m44 54 6 9 5-5 6 10 6-7 7 8 7-8 6 4 5-9" fill={paper} />
    <path d="M89 43q4-5 8 0m-17 6q5 3 8-1" fill="none" />
    <path d="m23 88-8-19 6-4 8 14 3-14q3-7 7-1l-1 26-8 7z" fill={yellow} /><rect x="11" y="45" width="10" height="28" rx="1" fill="#f44735" /><path d="M16 45q10-11 0-13-8-3-4-9" fill="none" strokeWidth="2" />
    <path d="m87 90 17 12-3 8-19-9M35 111h10m30 0h11" fill={yellow} />
  </>,
  'magical-athlete': <>
    <path d="m43 53-13 21-12 35h80L83 72 69 54z" fill="#3b62b2" /><path d="M35 67 18 44l10-13 24 25m23 1 18-24 12 8-18 34" fill="#3b62b2" />
    <path d="M41 35q5-14 23-8 13 5 9 23l12 12-14 3-3 15-22-7-8-15z" fill={orange} /><path d="M47 38q-7 1-4 10l6 7m8-6 14 1m-13 13q8-10 17 0l-5 5-8-4-6 2" fill="none" /><ellipse cx="65" cy="43" rx="6" ry="8" fill={paper} /><circle cx="68" cy="45" r="2.5" fill={ink} stroke="none" />
    <path d="M29 7q22 2 42 25l10 6-47 5 5-12z" fill="#3b62b2" /><path d="m34 43 44-7 10 9-52 7z" fill="#3b62b2" />
    <path d="m48 18 4 7 9 1-7 5 1 8-8-4-7 4 2-9-6-5 9-1zM45 83l5 10 12 1-9 7 1 10-10-6-9 6 2-11-9-6 12-1zM76 78l3 6 8 1-6 4 1 8-6-4-6 3 1-7-5-4 7-1z" fill={yellow} strokeWidth="2.4" />
    <ellipse cx="66" cy="55" rx="5.5" ry="7" fill={paper} /><ellipse cx="68" cy="56" rx="2.4" ry="3.3" fill={ink} stroke="none" /><path d="m60 46 13 2" fill="none" strokeWidth="2.6" />
    <path d="m12 25 97 17" stroke={ink} strokeWidth="9" /><path d="m12 25 97 17" stroke={purple} strokeWidth="5" /><path d="m11 25-5-8m1 7 2 9" fill="none" stroke={yellow} />
    <path d="m23 31-3-10q1-6 5-4l2 7 2-8q3-3 5 0l-1 10 4-5q5-1 4 4l-7 12zM94 43l-1-10q1-7 5-4l2 7 2-6q4-2 5 2l1 12-5 5z" fill={orange} />
  </>,
  mole: <>
    <path d="M19 105Q15 82 26 53 34 18 63 16q38-2 40 38l5 53z" fill={orange} /><path d="M32 40 21 51l2-14 10-13m37-8 6-6 6 6 8-4 2 9" fill={olive} strokeWidth="2.5" />
    <ellipse cx="58" cy="57" rx="6" ry="9" fill={paper} /><ellipse cx="83" cy="56" rx="6" ry="9" fill={paper} /><g fill={ink} stroke="none"><ellipse cx="60" cy="61" rx="2" ry="4" /><ellipse cx="85" cy="60" rx="2" ry="4" /></g><path d="m52 43 8-4m19 0 8 4" fill="none" />
    <ellipse cx="76" cy="71" rx="10" ry="12" fill="#ed8d92" /><ellipse cx="73" cy="72" rx="1.4" ry="3" fill={ink} stroke="none" /><ellipse cx="80" cy="72" rx="1.4" ry="3" fill={ink} stroke="none" />
    <path d="m66 83-6 21 10 1 7-20m0-1-7 21 11 1 4-23" fill={paper} />
    <path d="M66 70 29 62m36 14-37 4m39-1-31 16M85 69l23-10M86 75l25 5M86 80l19 15" fill="none" strokeWidth="1.8" />
    <path d="M7 111q-1-9 7-8 1-9 9-5l5 6q7-6 12 1 6-7 12 0 8-8 14 0 6-6 12 0 8-9 15-3 8-7 12 2 9-2 9 7z" fill={olive} /><path d="M29 101q-4-12 2-12 4 0 3 12m0 0q0-13 5-12 4 1 1 13m42-1q-2-12 3-12 4 0 4 12m0 0q0-11 5-10 4 1 0 12" fill="#ef929a" strokeWidth="2.5" />
  </>,
  'mr-dice-guy': <>
    <path d="m33 76-11 32h77L88 76 65 70z" fill={blue} /><path d="m33 77 22 16 8-15 8 15 17-16" fill="#ee5b36" /><path d="M65 92v18" fill="none" />
    <path d="M38 47q8-22 29-14 24 6 20 28-5 22-27 21-26-1-22-35z" fill={olive} /><Eyes x={52} y={56} gap={22} rx={5} ry={7} look={-1} /><path d="M49 69q15 14 30-1m-19-3h3" fill="none" />
    <path d="M38 8h45l5 32-52 3z" fill={purple} /><path d="m47 12 29 2 1 27-30-1z" fill="#4285bc" /><ellipse cx="61" cy="43" rx="35" ry="6" fill={purple} />
    <g fill={yellow} stroke="none"><circle cx="55" cy="20" r="2.7" /><circle cx="67" cy="20" r="2.7" /><circle cx="55" cy="27" r="2.7" /><circle cx="67" cy="27" r="2.7" /><circle cx="55" cy="34" r="2.7" /><circle cx="67" cy="34" r="2.7" /></g>
    <path d="m30 87-14-5m75 7 14-8" fill="none" strokeWidth="6" /><path d="m20 84-8-6 2-6 9 6m75 5 6-10 7 3-5 13" fill={olive} />
    <Die x={15} y={58} color="#76b854" angle={-13} /><Die x={104} y={65} color="#ef765a" angle={16} /><rect x="47" y="97" width="8" height="8" fill={pink} /><rect x="74" y="101" width="8" height="8" fill={green} />
  </>,
  mush: <>
    <path d="M15 100Q5 87 15 71 5 60 14 41L12 20q2-15 14-5l24 16q17-11 33-3l13-17 7 2-4 11 10-5 4 5-11 10q14 10 8 29 10 17-2 29 6 16-13 18H32q-16 6-17-10z" fill="#5596c2" />
    <path d="M15 39q19-16 35 3L37 55H15z" fill={ink} /><path d="m18 40 1 7 6-1 1-8 6 1 1 8 6-1 1-6 5 4-4 8H16z" fill={paper} strokeWidth="2" />
    <Eyes x={63} y={35} gap={20} rx={8} ry={9} look={-2} /><path d="M56 48q-11 8-6 15 10-7 29-10" fill="none" />
    <ellipse cx="30" cy="71" rx="7" ry="9" fill={paper} transform="rotate(25 30 71)" /><ellipse cx="32" cy="73" rx="3" ry="4" fill={ink} stroke="none" />
    <path d="M51 60q4 13-1 20-9 10 2 14 7 2 15-8 10-11 17-12M18 89q8 7 15 1m55-29 13 5m-5 5 9 6M26 103q7-9 15-3" fill="none" />
    <path d="M68 98q14-17 31-2l1 10H64z" fill={paper} /><path d="m74 94 1 10m7-13 1 14m7-12 2 11" fill="none" strokeWidth="2" />
  </>,
  nemesis: <>
    <path d="M35 67q22-7 43 0l14 42H22l5-30z" fill={cream} /><path d="m38 69 8 19 20 20M52 73l10 12 12-14m-28 17-8 19m36-23 10 24" fill="none" />
    <path d="M35 39q-4-24 22-27 30-2 30 24L75 61 42 62z" fill={cream} />
    <g fill={cream}><circle cx="36" cy="29" r="10" /><circle cx="42" cy="17" r="9" /><circle cx="55" cy="12" r="9" /><circle cx="69" cy="15" r="10" /><circle cx="80" cy="23" r="9" /><circle cx="85" cy="36" r="8" /><circle cx="32" cy="41" r="9" /></g>
    <g fill="none" strokeWidth="2"><path d="M35 26q-9 6-1 9 7 1 5-5m2-16q-7 4 0 8 6 2 5-4m10-8q-5-4-7 2-1 5 5 4m14-2q8 2 4 8-5 3-7-2m15 4q-6-3-7 3 0 5 6 4m4 5q7 5 1 9-6 1-4-4m-48-3q-8 4-1 8 6 2 5-4" /></g>
    <path d="M45 30q16-9 29 2l-2 17 6 7-13 2-2 12-19-5-6-14z" fill={cream} /><path d="m46 42 7-3m9 1 8 1m-16 1-2 9 9 2m-8 8q7-8 12-1l-1 7-10-1z" fill="none" strokeWidth="2.6" /><path d="m47 45 4 1m12-1 4-1" strokeWidth="3.5" />
    <path d="m96 8 6 9-7 66-7-1z" fill="#e5e8d4" /><path d="m90 19 5 0-6 57" fill="none" stroke="#a6ad99" strokeWidth="2" /><path d="m83 83 18 2m-11 0-1 22" stroke="#7f846d" strokeWidth="5" />
    <path d="m76 76 9 1 3 11q10 5 12-3l-3-9-9-2M29 82l-9 14 17 8" fill={cream} />
  </>,
  'nepo-baby': <>
    <path d="M29 84q27-13 60-1l10 27H22z" fill={blue} /><path d="m43 80 16 14 16-14-10 26H55z" fill={paper} /><path d="m56 92 10-1 2 13-7 7-7-9z" fill="#e35b35" /><path d="m38 93 10 15m33-16-7 17" fill="none" />
    <path d="M31 46q2-26 32-23 30 0 31 27l-3 19q-2 22-31 19-32-1-30-25z" fill="#d68bb8" /><path d="M31 52q-9-4-9 5 0 9 10 7m59-13q10-6 12 3 2 10-11 9" fill="#d68bb8" />
    <path d="M29 8h61l2 27H29z" fill={blue} /><path d="M29 26h63v8H29z" fill="#e45f40" /><ellipse cx="60" cy="37" rx="43" ry="6" fill={blue} />
    <circle cx="48" cy="55" r="8" fill={paper} stroke={brown} /><circle cx="49" cy="56" r="2.7" fill={ink} stroke="none" /><ellipse cx="74" cy="54" rx="5" ry="7" fill={paper} /><circle cx="74" cy="55" r="2.4" fill={ink} stroke="none" /><path d="M42 61q-6 23-2 42m23-40-4 4 7 1" fill="none" strokeWidth="2" />
    <ellipse cx="64" cy="73" rx="13" ry="7" fill="#ef7440" /><ellipse cx="65" cy="73" rx="5" ry="3.5" fill={blue} /><path d="M53 82q10 5 21 0" fill="none" />
    <path d="m94 98 10-10m0-13 1 17" stroke="#9ba3a2" strokeWidth="5" /><circle cx="104" cy="66" r="9" fill="#d9deda" /><path d="m99 63 10 2m-11 5 10 2" stroke="#9ba3a2" strokeWidth="2" /><path d="m96 93 6-6q7-2 8 4l-7 10" fill="#d68bb8" />
  </>,
  null: <>
    <path d="M30 15q13-10 28-4 18-8 31 3 16 1 18 18 11 10 2 27 9 17-2 31-1 19-22 19-12 9-28 2-18 7-29-4-19-2-18-22-9-12-2-27-7-17 3-28 2-16 19-15z" fill="#1e2022" />
    <g fill="#373b3b" stroke="none"><ellipse cx="29" cy="32" rx="2" ry="1" /><ellipse cx="86" cy="29" rx="2" ry="1" /><ellipse cx="21" cy="72" rx="2" ry="1.4" /><ellipse cx="95" cy="82" rx="1.5" ry="2" /><ellipse cx="43" cy="97" rx="1.4" ry="2" /><ellipse cx="72" cy="101" rx="2" ry="1.5" /><ellipse cx="90" cy="53" rx="1.2" ry="1.8" /></g>
    <g fill={paper} stroke="none"><ellipse cx="53" cy="61" rx="4" ry="5" /><ellipse cx="67" cy="61" rx="4" ry="5" /></g><g fill={ink} stroke="none"><ellipse cx="54" cy="61" rx="1.7" ry="2.5" /><ellipse cx="68" cy="61" rx="1.7" ry="2.5" /></g>
  </>,
  overtaker: <>
    <path d="M15 38v65" stroke={brown} strokeWidth="5" /><path d="M9 15q12-10 23 1 8 9-2 19l-2 10H14l-3-9Q1 28 9 15z" fill={cream} /><g fill={ink} stroke="none"><ellipse cx="12" cy="25" rx="4" ry="5" /><ellipse cx="26" cy="25" rx="4" ry="5" /><path d="m18 30 4 0-2 5z" /></g><path d="m17 39 0 7m7-7v7" strokeWidth="2" />
    <path d="M40 72q23-9 48 0l7 38H35z" fill={brown} /><path d="M37 75 28 92l13 10 11-15m31-12 15 15-10 13-12-16" fill={cream} /><path d="m54 75 3 13-7 21m24-34-4 34" fill="none" />
    <path d="M56 25q22-15 35 7l-1 20q-2 21-23 19-17-1-20-11-24 1-21-11 1-10 27-7z" fill={blue} /><path d="M49 49q18 14 35 2-5 15-24 12l-8-5" fill="#df5d44" /><path d="m57 54 1 8 6 0 1-7" fill={paper} strokeWidth="2" /><circle cx="35" cy="49" r="1.7" fill={ink} stroke="none" />
    <Eyes x={60} y={40} gap={17} rx={5} ry={7} look={-1} /><path d="m54 34 11 1m6-2 12 1" fill="none" />
    <path d="M53 25q6-24 27-15 19 6 17 32l-12-9-33-4z" fill={cream} /><path d="M65 12q20 3 22 23M78 11q16 7 16 28m-40-9 35 10" fill="none" strokeWidth="2" />
    <path d="m104 38 10 16-15 20-13-14z" fill="#b9bdb6" /><path d="m96 65-33 37" stroke={ink} strokeWidth="7" /><path d="m96 65-33 37" stroke={brown} strokeWidth="4" /><path d="m62 98-7-4q-9 1-4 7l11 6 8-6" fill={blue} />
  </>,
  'party-pooper': <>
    <path d="M30 88q29-17 58 0l6 23H25z" fill={pink} /><path d="m37 88-2 22m23-26 2 27m17-23 6 22" stroke={green} strokeWidth="8" />
    <path d="M34 45 36 27l19 14q15-6 28 2l17-8-3 24q12 34-21 36-34 8-48-15-10-17 6-35z" fill={yellow} />
    <path d="M38 34q-3-24 19-25 25 0 31 25l-13 9-31-1q-7-12-21 1l-8 14-6-7q6-27 29-16z" fill={pink} /><path d="M48 13q-1 10 7 26m10-27 8 25m-48 1 10-12" fill="none" stroke={green} strokeWidth="8" /><path d="m36 37 51-3 1 10-48 4z" fill={pink} /><circle cx="16" cy="55" r="9" fill={pink} />
    <Eyes x={51} y={59} gap={22} rx={6} ry={8} look={1} /><path d="m43 48 14 5m10-1 14-3" fill="none" /><path d="m57 68 20-1-10 17z" fill="#348bbb" /><path d="m67 84 0 7m-12-1q7-4 12 1 7-4 13-1" fill="none" strokeWidth="2.6" />
    <path d="M87 81q3-12 10-6l-1 5q11-4 12 4l-1 12-17 1-7-7q-4-6 4-9z" fill={yellow} />
    <path d="m21 70-2 29h10l1-29z" fill="#c8d9a5" /><path d="M21 69q-7-8 4-17 5 10 2 16z" fill="#f29b32" /><path d="M15 100h22l-5 9H18zm1 1q-13-4-9 5 3 4 10 1" fill={brown} />
  </>,
  penguin: <>
    <path d="M38 70Q21 59 12 32 6 21 7 40q2 40 27 54m48-26q15-16 27-37 9-14 5 5-4 37-26 57" fill={purple} />
    <path d="M31 83q-3-22 5-37 5-15 26-13 23 2 24 23l9 40q0 15-27 16-38 4-37-29z" fill={purple} /><path d="M47 62q14 7 32-4l4 17 9 23q-1 16-27 15-28 1-26-13z" fill={paper} />
    <path d="M39 28q2-20 23-21 21 2 22 20l-8 25-30 1z" fill={purple} /><Eyes x={51} y={25} gap={18} rx={6} ry={8} look={1} /><path d="m45 15 11 2m9-2 11 1" fill="none" />
    <path d="M55 37q24-6 46 9L77 52l-20-4z" fill={orange} /><path d="m59 48 28 0-11 12-15-3z" fill="#e45f36" /><path d="m77 45 22 1" fill="none" strokeWidth="2" />
    <path d="M39 10 44 4l18 1 6 7-4 4-26-1z" fill={brown} /><path d="m38 12 33 1" strokeWidth="4" />
    <path d="M41 61q2 13 10 17l-14-3m42-16 1 15 10 4" fill={orange} /><g fill={paper} strokeWidth="1.8"><circle cx="66" cy="83" r="2" /><circle cx="69" cy="94" r="2" /><circle cx="71" cy="104" r="2" /></g><path d="m42 109-9 5h22m25-5 9 5H69" fill={orange} />
  </>,
};
