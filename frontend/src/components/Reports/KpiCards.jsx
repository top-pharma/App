/**
 * @file KpiCards.jsx
 * @description
 * صف بطاقات KPI (تستخدم في كل التقارير).
 *
 * @example
 * <KpiCards items={[
 *   { label: 'مجموع مدين', value: '45,000', color: 'blue' },
 *   { label: 'مجموع دائن', value: '45,000', color: 'green' },
 * ]} />
 */

const COLORS = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  neutral: 'bg-neutral-50 text-neutral-700 border-neutral-200',
};

/**
 * @param {{
 *   items: Array<{
 *     label: string,
 *     value: string|number,
 *     subValue?: string,
 *     color?: keyof typeof COLORS,
 *     icon?: React.ComponentType,
 *   }>
 * }} props
 */
export default function KpiCards({ items = [] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item, idx) => {
        const Icon = item.icon;
        const colorClass = COLORS[item.color] || COLORS.neutral;
        return (
          <div
            key={idx}
            className={`rounded-xl border p-4 ${colorClass}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium opacity-80 mb-1">{item.label}</p>
                <p className="text-xl font-bold leading-tight">{item.value}</p>
                {item.subValue && (
                  <p className="text-[11px] opacity-70 mt-1">{item.subValue}</p>
                )}
              </div>
              {Icon && (
                <div className="flex-shrink-0 opacity-60">
                  <Icon size={20} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}