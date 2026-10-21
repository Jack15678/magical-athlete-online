import type { ReactNode } from 'react';

// Hand-drawn vector counterparts to the original box's flat, inked portraits.
// The Avatar component supplies the shared 120 × 120 viewport and outline.
const ink = '#191919', paper = '#fffdf4', yellow = '#ffda27', red = '#f44735';
const blue = '#254de4', pink = '#f6a8d0', green = '#b5d66b', purple = '#9664bb';

function Eyes({ x, y, gap = 18 }: { x: number; y: number; gap?: number }) {
  return <g fill={paper}>
    <ellipse cx={x} cy={y} rx="6.3" ry="8" />
    <ellipse cx={x + gap} cy={y - 1} rx="6.3" ry="8" />
    <g fill={ink} stroke="none"><circle cx={x + 1.8} cy={y + 1} r="2.6" /><circle cx={x + gap + 1.8} cy={y} r="2.6" /></g>
  </g>;
}

export const SECOND_WIND_PORTRAITS_C: Record<string, ReactNode> = {
  're-runner': <>
    <path d="m43 80-12 22-16 1q-9 8 10 9h17l14-25m10-8 17 13 14-8 8 7-20 13q-5 2-10-3L57 90" fill={pink} />
    <path d="m43 54-11 32 34 7 16-27-17-13z" fill={pink} />
    <path d="m36 70 36 9m-34-17 35 9" stroke={yellow} strokeWidth="6" />
    <path d="m40 57-13-5-9 14-9-7 14-22q3-5 9-2l19 9m22 15 12 9 13-14 8 8-17 20q-4 5-10 0L65 72" fill={pink} />
    <path d="M42 27q-2-20 20-21 25-1 26 22l-7 25q-5 12-20 10-22-3-23-18z" fill={paper} />
    <g fill="#b8b3bb"><circle cx="44" cy="19" r="8" /><circle cx="55" cy="12" r="8" /><circle cx="68" cy="11" r="8" /><circle cx="81" cy="17" r="8" /><circle cx="85" cy="29" r="7" /><circle cx="39" cy="30" r="7" /></g>
    <path d="M39 25q24-11 49 2l-2 9q-24-11-46-1z" fill={purple} />
    <Eyes x={51} y={39} gap={18} />
    <path d="m50 33 7-2m10 0 8 2M51 52q11 11 22-1m-17-5 4 3M21 101l9 8m66-24 5 7" fill="none" />
    <path d="m85 31 12 2-6 10-8-2" fill={purple} />
  </>,

  'show-off': <>
    <path d="M34 75v27m43-27v28M23 101h65M28 52v33h57V51" fill="none" stroke={blue} strokeWidth="8" />
    <path d="M30 79h53v10H30zM24 51h13v29H24m52-29h13v29H76" fill={yellow} />
    <path d="M40 64q-15 6-14 20l14 12 12-7-9-14m23-11q17 4 19 16l-9 19-14-6 8-16" fill={purple} />
    <path d="m26 92 19-5 7 14-23 7-8-8zm37 0 15 1 8 13-24 3-5-10z" fill={pink} />
    <g fill={green}><circle cx="28" cy="109" r="4" /><circle cx="45" cy="105" r="4" /><circle cx="65" cy="111" r="4" /><circle cx="82" cy="110" r="4" /></g>
    <path d="M42 36Q15 16 13 41q-3 24 27 20m39-26q25-15 28 8 1 21-27 20" fill={purple} />
    <path d="M43 27q-6-19 14-21 21-1 28 20l-3 35q-5 17-26 13-22-2-22-21z" fill={purple} />
    <path d="M29 22q14-18 37-16l14 14-10 7-33-4z" fill={green} />
    <path d="m54 8 5 14 23 1q9 0 11 6l-28 3-9-8" fill={pink} />
    <Eyes x={49} y={39} gap={20} />
    <path d="M60 46q-8 7-4 20l8 9q11 3 14-8 2-9-6-9l-3 6-6-5 3-12" fill={purple} />
    <path d="m39 51-8 8 13-3m35-5 9 8-13-2M21 37l8 7m63-5-7 6" fill={paper} />
  </>,

  soulmate: <>
    <path d="M83 79q31 14 24-9-4-10-12-5 13-18 19-2 8 33-28 33" fill={yellow} />
    <path d="M39 64q-17 12-13 31l15 8 34-2 17-13q0-21-24-29z" fill={yellow} />
    <path d="m35 96-12 10h22l8-9m20-1 1 13h18l-7-14" fill={yellow} />
    <path d="M26 39 19 16l22 9Q56 11 74 24l24-13-7 30q7 31-29 36-36 2-39-23z" fill={yellow} />
    <path d="m28 32-4-9 10 7m48 0 9-10-2 14" fill={pink} />
    <path d="M35 44q-10-11 0-16 7-2 10 5 8-8 13 0 7 10-13 20zm31-10q-4-11 5-12 7-1 9 6 9-5 13 3 4 11-16 19z" fill={red} />
    <ellipse cx="61" cy="56" rx="9" ry="6" fill={pink} />
    <path d="m49 63 12 6 15-10q2 21-12 21-11 0-15-17" fill={ink} />
    <path d="M59 69q13-10 14 0l-1 14q-7 10-14 0z" fill={red} />
    <path d="M65 73v11m-36-22-16-5m17 12-18 1m72-17 18-8" fill="none" />
    <path d="m30 78-12 9m62-11 13 8" fill="none" />
  </>,

  'speed-demon': <>
    <g fill={ink}><circle cx="26" cy="95" r="17" /><circle cx="94" cy="95" r="17" /></g>
    <g fill={paper}><circle cx="26" cy="95" r="9" /><circle cx="94" cy="95" r="9" /></g>
    <path d="m26 95 24-28 24 28H26m49-27 19 27M70 69l12-15h12" fill="none" stroke="#858699" strokeWidth="5" />
    <path d="M38 69q9-15 31-8l15 16-9 15H42l-11-9z" fill={red} />
    <path d="M25 70h35M76 66l13-3 10 8M49 91h17m-14-13h15" fill="none" />
    <path d="m42 59-10 13 15 10-7 11h17l7-16-14-10 13-10" fill={ink} />
    <path d="M37 38q17-11 32 3l1 24-25 3-12-15z" fill={blue} />
    <path d="m61 45 13 10 11-4 3 9-17 5-19-12" fill={blue} />
    <path d="M41 42Q19 38 23 23l-12-4 15-4-10-8 28 6 8-6 12 14z" fill="#f08d32" />
    <path d="M40 20q17-13 28 3l4 17-10 12-19-7-9-14z" fill="#a1aa50" />
    <path d="M42 19 36 6l14 10m12 6L69 9l4 18" fill="#a1aa50" />
    <path d="m47 28 8 3m4-4 8 1M52 40q9 4 14-3" fill="none" />
    <g fill={paper}><path d="m45 28 10 3-3 7-7-3zm14-1 9 1 1 7-9 2z" /></g>
    <path d="m12 60 13-4m-12 15h10M85 50l9 1" fill="none" />
  </>,

  spoilsport: <>
    <path d="M87 78q25-13 25 1-1 11-11 6-8-6 4-10" fill="none" stroke={pink} strokeWidth="7" />
    <path d="M37 68q-12 7-15 29l22 10h34l21-15q-4-21-22-25z" fill={pink} />
    <path d="m34 96-8 14h19l7-12m21 1 4 11h19L86 98" fill={pink} />
    <path d="M33 32Q14 9 31 7l16 19m30 0Q90 5 101 12l-8 27" fill={pink} />
    <path d="M24 46q-2-27 31-28 36-4 43 25l-1 23q-4 26-38 25-35-2-37-25z" fill={pink} />
    <path d="m38 37 11-5m23 0 12 7M34 48q8-10 17-1m20 0q8-9 17 3" fill="none" />
    <path d="M39 49q-12 9-9 24 6 5 11-1l4-21m35-1q12 7 12 24-6 5-11-1l-6-21" fill="#58b9e5" />
    <ellipse cx="61" cy="63" rx="23" ry="16" fill="#f486ae" />
    <g fill={ink} stroke="none"><ellipse cx="51" cy="63" rx="5" ry="7" /><ellipse cx="71" cy="63" rx="5" ry="7" /></g>
    <path d="M47 82q15-12 28 1m-48 0-14-9m79 9 14-7" fill="none" />
  </>,

  stepdad: <>
    <path d="M27 70q4-22 31-24 31 0 36 25l4 35q-38 12-78-1z" fill={purple} />
    <path d="M32 68 15 87l-7-8 16-25 13-2m45 7 14-10-1-22 10-2 3 30-19 21" fill={purple} />
    <path d="M93 29V15q4-9 9-1l1 14 6-7 4 4-5 14-14 3z" fill="#ee9138" />
    <path d="M35 35q-2-29 25-29 31-1 32 28l-4 24-23 13-28-13z" fill={purple} />
    <Eyes x={47} y={33} gap={23} />
    <path d="M36 47q7-15 25-3 17-13 26 2l-6 13q-14 1-20-7-10 8-24 6z" fill="#a65c3d" />
    <path d="m45 53 3 26q10-5 8-23m13 0q-3 22 6 24l4-27" fill={paper} />
    <ellipse cx="61" cy="42" rx="7" ry="5" fill={pink} />
    <path d="M40 69v35m40-36-2 37" fill="none" stroke={red} strokeWidth="9" />
    <path d="m51 72 11 6-11 7zm22 0-11 6 11 7z" fill={blue} />
    <path d="M27 106 16 112h29l9-7m17 0 9 8h24l-11-9" fill={purple} />
    <path d="M30 91h7m39 0h8M43 47l-6-4m39 5 7-5" fill="none" />
  </>,

  streaker: <>
    <path d="M69 77q28 3 35-18 8 27-26 32" fill="#f6d8a0" />
    <path d="m56 77-22 21-19 1q-9 5-2 10h28l28-24m-4-6 19 20 17-2 4 11-24 6-29-21" fill="#f6d8a0" />
    <path d="M48 49q1-16 17-14 16 3 10 19l-6 29-20-1-6-17z" fill="#f6d8a0" />
    <path d="m49 56-25 8-11-14-7 6 15 22q3 4 8 2l24-11m16-12 16 9 20-18 8 6-22 25q-4 4-8 0L65 70" fill="#f6d8a0" />
    <path d="M50 35 65 7q8 9 12 25l-2 14-15 10-11-5-1-8-19-4q-6-5 1-8z" fill="#f6d8a0" />
    <Eyes x={56} y={33} gap={15} />
    <path d="M52 46q8 8 17-1m-13 20 6 4M18 103l-2 5m80-7 4 8M18 26l12 2m-17 9h10" fill="none" />
  </>,

  stunner: <>
    <path d="m46 91-4 15-10 4q-3 5 15 4l7-8m17-15 6 15 12 2q6 7-13 6l-10-7" fill={pink} />
    <path d="M34 46 15 63l5 17 9-4-2-10 17-9m42-11 18 14-1 17-10-1 1-12-15-9" fill="#f29731" />
    <path d="M28 43q-9-22 11-26 12-11 23 1 16-13 26 0 17 1 12 23 13 12 3 28 1 23-22 26-12 14-27 2-22 6-27-13-15-10-9-27z" fill="#f08d32" />
    <path d="M58 20q-7-16 4-16l4 16-7 7" fill="#8a5e3d" />
    <path d="M40 26q-10 27-2 50m42-52q12 26 3 50M59 29v14m-2 37v14" fill="none" stroke="#c46626" />
    <path d="M38 47q8-9 16 0m15 0q9-9 16-1M40 43l-4-5m13 5 1-6m21 5v-6m11 5 4-5" fill="none" />
    <path d="M44 64q10-9 17-2 9-8 18-1-5 19-18 17-12 1-17-14z" fill={red} />
    <path d="M47 65q14 4 28-2" fill="none" />
  </>,

  switcharoo: <>
    <path d="M79 77q19 12 32-4-1 28-35 25" fill={yellow} />
    <path d="M38 68q-11 23-6 32l22 4 26-1q12-12-3-33z" fill={yellow} />
    <path d="m41 96-19 9-11 5q-3 5 23 3l21-9m18-7 13 7 20 3q9 9-17 7l-22-10" fill={yellow} />
    <path d="M43 71q-4-20 5-28h25l9 28-15 18-19-4z" fill={yellow} />
    <path d="M38 30Q25 4 39 5q11 0 16 25m13-2Q79 1 88 8q6 7-7 28" fill={yellow} />
    <path d="m40 13 7 14m31-11-5 13" stroke={pink} strokeWidth="5" />
    <path d="M38 39q0-17 23-16 25 3 22 22l-7 15-25 3-17-11z" fill={yellow} />
    <g fill={paper}><circle cx="45" cy="40" r="11" /><circle cx="71" cy="40" r="11" /></g>
    <g fill="none" stroke={pink} strokeWidth="5"><circle cx="45" cy="40" r="11" /><circle cx="71" cy="40" r="11" /><path d="M56 39h4" /></g>
    <g fill={ink} stroke="none"><circle cx="47" cy="41" r="3" /><circle cx="73" cy="41" r="3" /></g>
    <ellipse cx="58" cy="53" rx="7" ry="4" fill={pink} />
    <path d="M54 60q6 6 13-2m-22 10-18 7m51-10 11 10" fill="none" />
    <path d="M44 78q17 10 35-1l-5 18q-14 9-25-1z" fill="#f2d4a2" />
    <path d="m49 83 4 4m14 1 5-5" fill="none" />
  </>,

  tail: <>
    <path d="m42 88-3 17-12 3q-6 7 15 5l8-21m29-9 5 20 13 5q4 7-15 5l-12-24" fill={green} />
    <path d="m63 20 5-14 12 10m8 9 15-8-1 19m-1 10 14 3-12 13m-14 6 12 13-18 1" fill="#929c43" />
    <path d="M65 18q29-5 36 18 11 31-12 50-19 17-48 7L12 77q22 5 36-2 18-10 16-24-2-10-15-7l-8-11q4-13 24-15z" fill="#6dbb69" />
    <path d="M69 52q8 19-12 29-11 6-27 4" fill="none" />
    <Eyes x={55} y={31} gap={21} />
    <path d="m52 45 7 4 11-5m-6 31 8 3m9-17 8 3" fill="none" />
  </>,

  'the-hose': <>
    <path d="m32 93-6 15h16l5-15m32 0 7 15h16l-10-17" fill={green} />
    <ellipse cx="58" cy="87" rx="43" ry="19" fill="#68ad6c" />
    <ellipse cx="58" cy="83" rx="26" ry="8" fill={paper} />
    <ellipse cx="58" cy="72" rx="43" ry="19" fill={green} />
    <ellipse cx="58" cy="68" rx="26" ry="8" fill={paper} />
    <ellipse cx="58" cy="56" rx="43" ry="19" fill="#68ad6c" />
    <ellipse cx="58" cy="52" rx="26" ry="8" fill={paper} />
    <path d="M29 48V28q0-18 18-18h23l10 10-10 10H49q-6 0-6 7v15z" fill={green} />
    <path d="m70 12 17 1 5 7-6 10-16-1z" fill="#dfb54b" />
    <path d="m86 14 12-5 8 17-14 4z" fill={yellow} />
    <path d="m99 12 6 13" fill="none" />
    <g fill={paper}><ellipse cx="39" cy="26" rx="6" ry="8" /><ellipse cx="56" cy="24" rx="6" ry="8" /></g>
    <g fill={ink} stroke="none"><circle cx="41" cy="27" r="2.5" /><circle cx="58" cy="25" r="2.5" /></g>
    <path d="M39 40q9 6 17-1M26 61q28 15 62 0m-63 16q29 15 63 0m-63 16q30 14 64-1" fill="none" />
    <path d="M110 10q10 10 0 11-7-1 0-11z" fill="#58b9e5" />
  </>,

  understudy: <>
    <path d="m41 86-5 22H24m47-22 9 22h15" fill="none" stroke={purple} strokeWidth="9" />
    <path d="M36 59q23-12 43 2l8 27-19 8-13-7-14 7-14-14z" fill={yellow} />
    <path d="m43 63-5 19m17-20-1 26m14-25 7 21" fill="none" stroke="#d2a237" strokeWidth="5" />
    <path d="m35 64-17 8 8 20 11-6-5-11m43-10 18 7-1 14-11-1-1-10" fill={yellow} />
    <path d="M44 27q-3-18 19-19 22-2 24 18l-1 12 16 10-20 4q-4 13-22 11-24-3-23-23z" fill={purple} />
    <path d="M33 27q5-20 29-20 24 0 30 17l-23 7z" fill="#6f9d58" />
    <path d="M35 27q26-7 56 0" fill="none" stroke={yellow} strokeWidth="6" />
    <path d="M55 17Q52 1 70 5L59 19m-1-8 7 1" fill={green} />
    <Eyes x={53} y={39} gap={18} />
    <path d="m57 53 10 3 8-4" fill="none" />
    <path d="m36 57 10 1 2 7 8-5 7 7 7-6 8 3 7-7 4 12-13 7-16-4-13 1-10-9z" fill={paper} />
    <path d="m86 73 23-6v33l-23 8-13-7V69z" fill={paper} />
    <path d="M86 73v35m5-30 11-3m-11 11 11-3m-11 11 8-2m-20-16 3 2m-3 9 3 2" fill="none" />
    <path d="M81 82q-11-5-11 3l10 8 7-4" fill={purple} />
  </>,
};
