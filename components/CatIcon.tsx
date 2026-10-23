import { catStyle } from '@/lib/catIcons';

/** Bolinha colorida com o símbolo da categoria */
export default function CatIcon({ name, size = 40, income = false }: { name?: string | null; size?: number; income?: boolean }) {
  const st = income && !name ? catStyle('Renda extra') : catStyle(name);
  const icon = Math.round(size * 0.52);
  return (
    <span
      className="cat-icon"
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: size / 2, background: `${st.color}24`, color: st.color, boxShadow: `inset 0 0 0 1px ${st.color}40` }}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: st.svg }} />
    </span>
  );
}
