type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

// Logo "Casa que cresce": o telhado vira uma seta para cima
export const IconLogo = ({ size = 22 }: P) => (
  <svg {...base(size)} viewBox="22 26 88 82" strokeWidth={11}>
    <path d="M30 100V64l30-24 18 14" />
    <path d="M30 100h72V74" />
    <path d="M70 66l32-32M84 34h18v18" />
  </svg>
);
export const IconHome = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
);
export const IconBills = ({ size = 22 }: P) => (
  <svg {...base(size)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
);
export const IconChat = ({ size = 24 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z" /></svg>
);
export const IconPlus = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconMore = ({ size = 22 }: P) => (
  <svg {...base(size)}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
);
export const IconBack = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
);
export const IconSend = ({ size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconCheck = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>
);
export const IconArrowDown = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
export const IconArrowUp = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconMinus = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M5 12h14" /></svg>
);
export const IconReceipt = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>
);
export const IconTarget = ({ size = 22 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" /></svg>
);
export const IconChevron = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconList = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="0.8" /><circle cx="4" cy="12" r="0.8" /><circle cx="4" cy="18" r="0.8" /></svg>
);
export const IconMic = ({ size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconStop = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const IconSpeaker = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
);
export const IconSpeakerOff = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>
);
export const IconBell = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
);
export const IconCalendar = ({ size = 22 }: P) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
);
export const IconClip = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" /></svg>
);
export const IconX = ({ size = 14 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconCard = ({ size = 22 }: P) => (
  <svg {...base(size)}><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6.5 15h4" /></svg>
);
export const IconPie = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M21 12a9 9 0 1 1-9-9v9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></svg>
);
export const IconTrend = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
);
