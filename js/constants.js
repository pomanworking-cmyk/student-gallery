// 貼紙同讚美詞（如要修改，記得同步修改 supabase/setup.sql 入面嘅清單）
export const STICKERS = [
  { id: 'love',    label: '好鍾意' },
  { id: 'wow',     label: '好厲害' },
  { id: 'idea',    label: '好有創意' },
  { id: 'cool',    label: '好有型' },
  { id: 'giggle',  label: '好得意' },
  { id: 'touched', label: '好感動' },
  { id: 'yum',     label: '好吸引' },
  { id: 'curious', label: '點畫㗎？' },
  { id: 'shy',     label: '好溫馨' },
  { id: 'peek',    label: '想睇多次' },
];

export const PHRASES = [
  '我好鍾意你用嘅顏色！',
  '構圖好特別！',
  '好有創意！',
  '畫得好細心！',
  '線條好靚！',
  '好有想像力！',
  '睇得出你好用心！',
  '好有你自己嘅風格！',
  '主題表達得好清楚！',
  '我想學你咁畫！',
];

export const stickerUrl = (id) => `stickers/${id}.webp`;

// 三種風格嘅預設顏色
export const THEMES = {
  minimal: {
    name: '簡約美術館',
    desc: '白牆、木地板、柔和燈光',
    wall: '#f4f1ec', floor: '#c9a27a', bg: '#e9e4dc', accent: '#2b2b2b',
  },
  colorful: {
    name: '色彩繽紛',
    desc: '每幅畫背後一種鮮色',
    wall: '#fffaf0', floor: '#3d4a7a', bg: '#ffd166', accent: '#ef476f',
  },
  kids: {
    name: '童趣小學',
    desc: '暖黃牆、彩旗、軟墊地板',
    wall: '#fff3c4', floor: '#8ecae6', bg: '#bde0fe', accent: '#fb8500',
  },
};

export const COLORFUL_PANELS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f15bb5', '#00bbf9', '#fb8500'];

export function themeColors(g) {
  const base = THEMES[g.theme] || THEMES.minimal;
  const c = g.colors || {};
  return {
    wall: c.wall || base.wall,
    floor: c.floor || base.floor,
    bg: c.bg || base.bg,
    accent: c.accent || base.accent,
  };
}

export const FONT = '"Noto Sans TC","PingFang HK","Microsoft JhengHei",sans-serif';
export const KIDS_FONT = '"Chiron GoRound TC","Noto Sans TC","PingFang HK",sans-serif';

export const GRADES = ['1', '2', '3', '4', '5', '6'];
const CN = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
export const gradeLabel = (g) => (g === 'all' ? '全校' : CN[g] ? `${CN[g]}年級` : '');
