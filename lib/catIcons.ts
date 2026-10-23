// Símbolo e cor de cada categoria (usado no extrato, gráfico, orçamento, cartões…)
export type CatStyle = { color: string; svg: string };

export const CAT_ICONS: Record<string, CatStyle> = {
  "Moradia": { color: '#7AA2FF', svg: "<path d=\"M3 11l9-7 9 7\"/><path d=\"M5 9.5V20h14V9.5\"/><path d=\"M10 20v-6h4v6\"/>" },
  "Mercado": { color: '#5EE0C1', svg: "<circle cx=\"9\" cy=\"20\" r=\"1.4\"/><circle cx=\"17.5\" cy=\"20\" r=\"1.4\"/><path d=\"M2.5 3.5h2.8l2.3 11.3a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20.5 7H6\"/>" },
  "Contas da casa": { color: '#FFC266', svg: "<path d=\"M13 2.5L5 13.5h6l-1 8 8-11h-6z\"/>" },
  "Transporte": { color: '#9DB9FF', svg: "<path d=\"M4 16.5V13l1.8-4.6A2 2 0 0 1 7.7 7h8.6a2 2 0 0 1 1.9 1.4L20 13v3.5\"/><path d=\"M4 13h16\"/><circle cx=\"7.5\" cy=\"16.5\" r=\"1.8\"/><circle cx=\"16.5\" cy=\"16.5\" r=\"1.8\"/><path d=\"M9.3 16.5h5.4\"/>" },
  "Saúde": { color: '#FF8A9B', svg: "<path d=\"M12 20s-8-5.2-8-10.6A4.4 4.4 0 0 1 12 6.6a4.4 4.4 0 0 1 8 2.8C20 14.8 12 20 12 20z\"/><path d=\"M5 12h3.5l1.5-2.5 2.5 5 1.5-2.5H19\"/>" },
  "Educação": { color: '#B69CFF', svg: "<path d=\"M2.5 9L12 4.5 21.5 9 12 13.5z\"/><path d=\"M6.5 11v4.5c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8V11\"/><path d=\"M21.5 9v5\"/>" },
  "Bebê": { color: '#FFB4D2', svg: "<path d=\"M10 2.5h4\"/><path d=\"M9 5h6l.6 2.5H8.4z\"/><rect x=\"7.5\" y=\"7.5\" width=\"9\" height=\"14\" rx=\"3\"/><path d=\"M7.5 12h3M7.5 15.5h3\"/>" },
  "Restaurantes e delivery": { color: '#FF8A6B', svg: "<circle cx=\"13.5\" cy=\"12.5\" r=\"5.5\"/><circle cx=\"13.5\" cy=\"12.5\" r=\"2.6\"/><path d=\"M3.5 3.5v5a1.5 1.5 0 0 0 3 0v-5M5 9.5v11\"/><path d=\"M20.5 3.5v17\"/>" },
  "Lazer": { color: '#5EE0C1', svg: "<path d=\"M3 7.5h18v3a2 2 0 0 0 0 3v3H3v-3a2 2 0 0 0 0-3z\"/><path d=\"M14 7.5v9\" stroke-dasharray=\"1.6 2\"/>" },
  "Assinaturas": { color: '#B69CFF', svg: "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"12.5\" rx=\"2.5\"/><path d=\"M10.5 8.3l4.2 2.5-4.2 2.5z\"/><path d=\"M8 20.5h8\"/>" },
  "Compras": { color: '#FFC266', svg: "<path d=\"M5.5 8h13l-1 13h-11z\"/><path d=\"M9 10V7a3 3 0 0 1 6 0v3\"/>" },
  "Outros": { color: '#98A5C2', svg: "<path d=\"M3.5 12.5V4h8.5l8.5 8.5-8 8z\"/><circle cx=\"8\" cy=\"8.5\" r=\"1.3\"/>" },
  "Salário": { color: '#4ADE80', svg: "<rect x=\"3\" y=\"6.5\" width=\"18\" height=\"13.5\" rx=\"3\"/><path d=\"M3 10.5h18\"/><path d=\"M15.5 15h2.5\"/><path d=\"M6.5 6.5L15 3.5l1.2 3\"/>" },
  "Renda extra": { color: '#4ADE80', svg: "<circle cx=\"9.5\" cy=\"12\" r=\"6\"/><path d=\"M9.5 9v6M6.5 12h6\"/><path d=\"M15.5 6.4a6 6 0 0 1 0 11.2\"/>" },
  "Rendimentos": { color: '#4ADE80', svg: "<path d=\"M3.5 17l5.5-5.5 4 4 7.5-7.5\"/><path d=\"M15 8h5.5v5.5\"/>" },
  "Sem categoria": { color: '#FFC266', svg: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6\"/><path d=\"M12 17h.01\"/>" },
};

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Categorias novas pegam o símbolo mais parecido pelo nome
const GUESS: [RegExp, string][] = [
  [/mercad|super|feira|hortifruti|acougue|padaria/, 'Mercado'],
  [/restaur|delivery|ifood|lanche|comida|jantar|almoco|bar\b|cafe/, 'Restaurantes e delivery'],
  [/bebe|filho|crianca|fralda|escola infantil|creche/, 'Bebê'],
  [/casa|moradia|aluguel|condominio|iptu/, 'Moradia'],
  [/luz|energia|agua|gas|internet|telefone|celular|conta/, 'Contas da casa'],
  [/transporte|carro|combust|gasolina|uber|onibus|estacion|pedagio/, 'Transporte'],
  [/saude|farmac|medic|remedio|dentista|plano|academia/, 'Saúde'],
  [/educa|curso|escola|faculdade|livro/, 'Educação'],
  [/lazer|viagem|cinema|passeio|show|festa|pet|presente/, 'Lazer'],
  [/assinatura|streaming|netflix|spotify|app/, 'Assinaturas'],
  [/compra|roupa|loja|eletron|shopping/, 'Compras'],
  [/salario|pagamento|holerite/, 'Salário'],
  [/renda|extra|freela|venda|bonus/, 'Renda extra'],
  [/rendimento|juros|dividendo|investimento/, 'Rendimentos'],
];

export function catStyle(name?: string | null): CatStyle {
  if (!name) return CAT_ICONS['Sem categoria'];
  if (CAT_ICONS[name]) return CAT_ICONS[name];
  const n = norm(name);
  for (const [re, key] of GUESS) if (re.test(n)) return CAT_ICONS[key];
  return CAT_ICONS['Outros'];
}
