import type { ReactNode } from 'react';

// Hand-authored 2D portraits: shapes evoke the reference silhouettes without tracing art.
// The shared Avatar supplies the 120px SVG, rounded stroke, and circular frame.
const yellow = '#ffda27', red = '#f44735', blue = '#254de4', pink = '#f6a8d0';
const green = '#b5d66b', paper = '#fffdf4', ink = '#191919';
const purple = '#9b73c7', orange = '#ef9544', turtle = '#87bbd6', armour = '#c6d2cf';

function PortraitEyes({ x, y, gap = 24, small = false, look = 2 }: { x: number; y: number; gap?: number; small?: boolean; look?: number }) {
  const rx = small ? 5.5 : 8, ry = small ? 7 : 10;
  return <g fill={paper}>
    <ellipse cx={x} cy={y} rx={rx} ry={ry} />
    <ellipse cx={x + gap} cy={y - 2} rx={rx} ry={ry} />
    <g fill={ink} stroke="none"><ellipse cx={x + look} cy={y + 1} rx={small ? 2.3 : 3.2} ry={small ? 3.4 : 4.8} /><ellipse cx={x + gap + look} cy={y - 1} rx={small ? 2.3 : 3.2} ry={small ? 3.4 : 4.8} /></g>
  </g>;
}

export const SECOND_WIND_PORTRAITS_A: Record<string, ReactNode> = {
  'bite-mark': <>
    <path d="M26 85 19 60l5-35 15-9 20-6 29 10 10 26-5 39-22-8-21 7z" fill={purple} />
    <path d="m32 40-17-9 7 28 14 4m49-23 19-12-5 29-13 7" fill={green} />
    <path d="M31 36q27-19 55 0l5 27q-5 21-29 22-29-2-33-22z" fill={green} />
    <path d="m30 32 10-10 5 10 11-11 5 10 12-9 6 12 12-5" fill={purple} />
    <PortraitEyes x={45} y={49} gap={27} look={-1} />
    <path d="m36 37 15 4m15-1 15-5M57 56l-3 8 10 1" fill="none" />
    <path d="M49 73q10-12 24-1l-2 8-11-3z" fill={ink} /><path d="m66 69 4 8 4-6" fill={paper} />
    <path d="M31 80q29 14 59-1l13 35H18z" fill={paper} />
    <path d="M34 81q23 18 50 0l-2 9q-24 13-48-1z" fill={purple} />
    <path d="m22 109-5-17 4-11 5 11 1-15 5 14 5-9 1 18 10 7m48 2 7-17-3-11-6 11-1-15-5 14-6-9 1 18-9 7" fill={green} />
  </>,
  blunderdog: <>
    <path d="m36 71-11 41h68L80 70z" fill={blue} />
    <path d="m35 72-10 17 8 25h55l5-25-12-17z" fill={red} />
    <path d="m38 35-8-22 22 14m20 0 20-14-4 25" fill={yellow} />
    <path d="M29 36q32-20 61 0l3 24q-5 23-34 23-30-3-33-24z" fill={yellow} />
    <path d="m29 42 16 2 15-5 17 4 16-5-2 18-13 3-18-5-17 6-15-5z" fill={blue} />
    <PortraitEyes x={45} y={49} gap={28} small />
    <path d="M40 64q20-6 42 3l-4 9H47z" fill={paper} /><path d="m51 64 1 10m9-10 1 11m9-9v9" fill="none" strokeWidth="2" />
    <path d="M83 56q17-4 17 6-3 8-18 8l-8-7z" fill={pink} /><circle cx="89" cy="60" r="2" fill={ink} stroke="none" />
    <path d="m30 83-12-8-2-36 12-3 8 24m54 23 12-8 2-36-12-3-8 24" fill={yellow} />
    <path d="M13 40 9 31l3-10 5 1 2 9 1-14 6-1 2 15 3-9 6 4-1 14-8 7zm94 0 4-9-3-10-5 1-2 9-1-14-6-1-2 15-3-9-6 4 1 14 8 7z" fill={yellow} />
    <path d="m60 78 5 10 11 1-8 7 3 11-11-6-10 6 2-11-8-7 12-1z" fill={blue} />
  </>,
  cheatah: <>
    <path d="M87 104q24 8 21-14-2-10-8-8l-1 11-14-4" fill={orange} />
    <path d="M36 72q28-9 55 2l5 40H27z" fill={green} />
    <path d="m38 35-3-22 19 10m20 1 13-11 6 25" fill={orange} />
    <path d="M37 29q27-14 47 6l8 21 13 4q-1 18-26 19L47 75q-18-12-10-46z" fill={orange} />
    <PortraitEyes x={52} y={43} gap={24} small look={-1} />
    <path d="M94 55q12-6 14 5-2 7-13 5z" fill={ink} />
    <path d="M57 62q18 7 36 1-8 17-27 9z" fill={paper} /><path d="m68 66 2 8m9-8 2 7m9-8-2 5" fill="none" strokeWidth="2" />
    <g fill={ink} stroke="none"><circle cx="41" cy="52" r="3" /><circle cx="43" cy="61" r="2.5" /><circle cx="49" cy="59" r="2" /><ellipse cx="43" cy="89" rx="5" ry="4" /><ellipse cx="66" cy="84" rx="5" ry="4" /><ellipse cx="82" cy="100" rx="6" ry="4" /><circle cx="54" cy="106" r="4" /><circle cx="91" cy="81" r="3" /></g>
    <path d="m33 94-12-11 2-13 8 2 7 11m51 1 9-9 6 5-4 16-9 4" fill={orange} />
    <path d="M9 56h24v28H9z" fill={paper} /><g fill={green} stroke="none"><circle cx="16" cy="63" r="2.4" /><circle cx="26" cy="63" r="2.4" /><circle cx="16" cy="70" r="2.4" /><circle cx="26" cy="70" r="2.4" /><circle cx="16" cy="77" r="2.4" /><circle cx="26" cy="77" r="2.4" /></g>
  </>,
  critic: <>
    <path d="M16 97Q1 47 22 23q13-15 39-8 25 11 28 41l-3 48z" fill={purple} />
    <path d="M28 21q-4 35 14 61m-27-9 22-4M46 16q-2 18 12 33m-1-19 21 6" fill="none" />
    <path d="M38 65q23-14 50 1l5 48H29z" fill={green} />
    <path d="M43 54q-5-32 22-35 22-1 28 23 23-1 21 13-2 16-24 16H62q-17-2-19-17z" fill={turtle} />
    <PortraitEyes x={65} y={35} gap={23} small look={-1} />
    <path d="m66 57 16 4 10-3M54 74l17 8-5 31M39 90l17-2" fill="none" />
    <circle cx="75" cy="94" r="2" fill={ink} stroke="none" /><circle cx="76" cy="106" r="2" fill={ink} stroke="none" />
    <path d="M89 109q21-5 13-23l-9-14-3-8-8 2 3 10-6-3-5 6 13 14-11 7z" fill={turtle} />
    <path d="M13 87h23l-3 19H17z" fill={paper} /><path d="M35 90q14-1 10 10l-11 2M16 86q9-3 17 0" fill="none" />
  </>,
  diva: <>
    <path d="M32 31q0-18 17-20l4 5 8-6 5 6 10-3 11 19 5 44-6 38H30L23 74z" fill={green} />
    <path d="m32 45 23 2 6-3 23-2-3 15-18 4-5-9-6 10-17-5z" fill={ink} /><path d="m25 43 10 2m48-3 10-4" fill="none" />
    <path d="m51 64 10-3 8 4-2 5-7 3-10-3z" fill={red} /><path d="m50 70 10-1 8 1-7 7z" fill={red} />
    <path d="M31 39q-15-9-19 4-8 11 1 18-9 9 0 18-7 9 3 16-5 11 9 15l12-8-3-15 4-13-5-12 5-11zM87 40q15-8 20 4 8 10-1 18 8 8 0 17 7 10-2 17 4 12-10 14l-11-8 3-14-4-13 5-12-5-11z" fill={pink} />
    <path d="m19 43 9 5-8 9m-4 10 11 7-8 8m-1 11 9 6m72-52-8 5 8 8m3 10-11 5 7 8m1 10-9 6" fill="none" strokeWidth="2" />
    <path d="m101 52 3-19" fill="none" strokeWidth="5" /><ellipse cx="105" cy="21" rx="9" ry="13" fill={purple} /><path d="m103 15 4-3" fill="none" stroke={paper} strokeWidth="2" />
  </>,
  doppelgangster: <>
    <path d="M16 78q21-13 43 0l7 36H11zM65 78q22-14 43 0l6 36H58z" fill={purple} />
    <path d="m26 79 10 25 12-25m28 0 12 25 10-25" fill={yellow} /><path d="m35 82 5-2 4 5-4 18-5-14zm50 0 5-2 4 5-4 18-5-14z" fill={red} />
    <path d="M22 32h33v35q-1 15-16 15-17-1-17-16zm48-1h33v37q-2 15-17 15-17-2-17-16z" fill={orange} />
    <PortraitEyes x={31} y={46} gap={14} small look={-1} /><PortraitEyes x={80} y={47} gap={14} small look={-2} />
    <path d="M35 49q-8 20 1 22 8 1 7-8L42 50m42 2q-7 24 2 24 10-1 4-24" fill={orange} />
    <path d="m29 74 10 2 7-3m35 4q8-7 15 1m-22-40 9 3m7-2 9-4" fill="none" />
    <path d="M12 34 22 16l24 1 9 17zm50 0 11-20 23 3 12 17z" fill={purple} /><path d="M15 29h39v7H15zm51 0h38v7H66z" fill={red} /><path d="M8 36h51m2 0h51" fill="none" strokeWidth="5" />
    <path d="m21 89-1 22m8-11-1 13m22-23 4 22m18-22-1 22m28-23 4 23" fill="none" strokeWidth="1.8" /><path d="m52 84 6-2 5 5-5 6-6-3zm51 1 6-2 5 5-5 6-6-3z" fill={red} />
  </>,
  gloth: <>
    <path d="M30 65 17 50 9 27l12-7 19 26h39l18-26 13 6-9 30-13 11 13 47H21z" fill={ink} />
    <path d="M28 49Q17 19 41 15l7-8 10 9 14-9 5 12q23 5 15 38L79 80H43z" fill={ink} />
    <path d="M35 37q19-16 40-4l10 17q3 27-23 33-29-1-32-24z" fill={paper} />
    <path d="m35 49 16-6 5 11-14 7-11-3zm29-5 15 2 7 10-15 4-10-6z" fill={ink} />
    <g fill={paper} stroke="none"><ellipse cx="45" cy="52" rx="4" ry="5" /><ellipse cx="73" cy="51" rx="4" ry="5" /></g><g fill={ink} stroke="none"><circle cx="46" cy="53" r="2" /><circle cx="72" cy="52" r="2" /></g>
    <path d="m55 62 11-1-4 7z" fill={purple} /><path d="m53 75 7-6 8 4-7 4z" fill={ink} />
    <path d="m36 79 7 12 7-7 9 12 8-12 9 7 8-13" fill={purple} />
    <path d="M10 29 8 12l5-4 3 16 1-17h6l1 20-3 12zm99 0 3-17-5-4-3 16-1-17h-6l-1 20 3 12z" fill={purple} />
  </>,
  'hog-knight': <>
    <path d="M35 62V49q-7-29 22-34 29 2 25 34v15z" fill={armour} />
    <path d="M43 33q13-13 28-1v20H43z" fill={pink} /><PortraitEyes x={51} y={37} gap={15} small /><path d="m48 48 2 6m10-6 1 6m9-6-1 6" fill="none" strokeWidth="2" />
    <path d="M29 58q8-10 16 1l2 15H29zm49-1q11-9 16 2v17H78z" fill={armour} />
    <path d="m100 69-1-48m0-15 8 16-16 1z" fill={armour} /><path d="M99 22v50" fill="none" strokeWidth="4" />
    <path d="M21 67 14 47l23 13m47 4 19-19-1 25" fill={green} />
    <path d="M20 72q21-22 59-12 27 11 26 30-3 23-42 23-39-1-45-21z" fill={green} />
    <PortraitEyes x={45} y={75} gap={29} small /><path d="m29 84-10 4 5 14 9-5m53-8 15-6-3 18-10 1" fill={paper} />
    <ellipse cx="74" cy="94" rx="18" ry="12" fill={green} /><ellipse cx="68" cy="94" rx="2.5" ry="4" fill={ink} stroke="none" /><ellipse cx="81" cy="93" rx="2.5" ry="4" fill={ink} stroke="none" />
    <path d="M40 99q7 7 18 5" fill="none" /><path d="m50 106 6 5 5-5" fill={red} />
  </>,
  hopfrog: <>
    <path d="M25 60q-8-35 5-47 16-9 23 29m17-2q4-34 20-30 19 8 11 43" fill={red} />
    <ellipse cx="37" cy="35" rx="11" ry="21" fill={paper} /><ellipse cx="84" cy="32" rx="11" ry="21" fill={paper} />
    <g fill={ink} stroke="none"><ellipse cx="40" cy="35" rx="5" ry="14" /><ellipse cx="86" cy="31" rx="5" ry="14" /></g>
    <path d="M24 51q36-18 72 1l13 22q-11 27-50 26-38-3-49-23z" fill={red} />
    <path d="M22 69q37 21 77-1M33 65h1m54-2h1" fill="none" />
    <path d="m34 88-8 13 14 10-22 3m62-26 16 12-14 11h26" fill={red} />
    <path d="m21 92-9-10-3-13 5-2 7 10-4-17 5-2 7 18-1 18m65 0 12-11 6-13-5-2-9 11 6-18-5-2-10 18-1 18" fill={red} />
  </>,
  hotel: <>
    <path d="M21 45h78v57H21z" fill={red} /><path d="M12 49 60 12l48 37z" fill={red} />
    <path d="M57 17V9h17v14" fill={red} /><path d="M14 49h91M23 43l37-27" fill="none" />
    <PortraitEyes x={45} y={63} gap={30} look={3} />
    <circle cx="62" cy="77" r="12" fill={red} />
    <path d="M29 86q33 18 63-2-5 21-31 21-25-1-32-19z" fill={paper} /><path d="m40 90 2 9m10-5v9m10-8v9m11-11-2 10m12-14-3 10" fill="none" strokeWidth="2" />
    <path d="m26 103-9 10h20m49-10 8 10h14" fill={yellow} />
    <path d="m26 62 2 7 7 1-6 5 1 8-7-5-6 3 2-7-5-5 8-1z" fill={yellow} /><path d="M93 58h5v14h-5" fill={paper} />
  </>,
  icarus: <>
    <path d="M32 32Q5 13 8 63l10 46 22-13V42zm56 0q27-20 24 30l-10 47-22-13V42z" fill={green} />
    <path d="m19 40 7 53m-11-28 8 32m78-56-7 51m12-29-8 34" fill="none" strokeWidth="2" />
    <path d="m39 76-7 38h56l-8-38z" fill={pink} />
    <path d="M34 42q-1-21 26-21 27 0 27 25l-3 26q-6 17-25 17-22-2-25-23z" fill={yellow} />
    <path d="M32 43q-3-29 24-32 27 0 32 27L69 30 39 43z" fill={pink} /><path d="M43 18h29M33 41l-7 3v23l13 7V47m46-9 9 5v24l-13 5V47" fill={pink} />
    <ellipse cx="48" cy="53" rx="11" ry="13" fill={purple} /><ellipse cx="73" cy="52" rx="11" ry="13" fill={purple} /><PortraitEyes x={48} y={53} gap={25} small />
    <path d="m59 50 3-1M42 73q17-8 39-2l-3 9H46z" fill={paper} /><path d="m51 71 1 9m9-9v9m10-9 1 8" fill="none" strokeWidth="2" />
    <path d="M21 66v47m79-48v48" fill="none" stroke={armour} strokeWidth="4" /><path d="M38 85 25 80l-7 3 1 12 9 1 8-4m46-7 13-5 7 3-1 12-9 1-8-4" fill={yellow} />
    <path d="M56 94h8v10h-8z" fill={paper} />
  </>,
  kingtripper: <>
    <path d="M30 82q28-10 55 2l13 30H18z" fill={purple} />
    <path d="M25 39q28-16 55-2l8 18 20 7q7 20-16 29-31 17-59-2-17-16-8-50z" fill={green} />
    <PortraitEyes x={43} y={45} gap={27} look={1} /><circle cx="96" cy="64" r="2" fill={ink} stroke="none" />
    <path d="M32 70q31 17 68 1-8 25-33 24-23-1-35-25z" fill={paper} /><path d="m44 75 3 12m10-9 2 15m11-14-1 14m13-17-4 14m15-17-5 11" fill="none" strokeWidth="2" />
    <path d="M25 35 22 15q18-11 31 10 10-24 29-17l6 27z" fill={red} /><path d="M24 31h64v10H24z" fill={yellow} />
    <circle cx="22" cy="15" r="5" fill={yellow} /><circle cx="83" cy="10" r="5" fill={yellow} /><path d="m50 25 4 7" fill="none" />
    <path d="M103 83v31" fill="none" stroke={yellow} strokeWidth="5" /><path d="M99 70q13-3 12 8l-5 9-10-6z" fill={red} /><path d="m88 101 8 4 5-10 7 2 2 14-12 3" fill={red} />
    <path d="m31 98 8 10 14-6m15 2 12 5 7-10" fill="none" stroke={yellow} />
  </>,
};
