/**
 * @file Section.jsx
 * @description
 * مكوّن "قسم" — يغلّف مجموعة حقول بعنوان وأيقونة (اختياري).
 *
 * يُستخدم في النماذج الطويلة لتقسيمها بصرياً:
 *   <Section title="البيانات الأساسية" icon={ShoppingCart}>
 *     ... حقول ...
 *   </Section>
 *
 * Props:
 *  - title: عنوان القسم (string)
 *  - icon: مكوّن أيقونة من lucide-react (اختياري)
 *  - description: وصف صغير تحت العنوان (اختياري)
 *  - children: محتوى القسم
 *  - className: classes إضافية (اختياري)
 *  - collapsible: هل يمكن طيّ القسم؟ (افتراضي false)
 *  - defaultOpen: مفتوح افتراضياً عند collapsible=true (افتراضي true)
 */

import { useState } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';

const Section = ({
  title,
  icon: Icon,
  description,
  children,
  className = '',
  collapsible = false,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  /* ─── وضع قابل للطي ─── */
  if (collapsible) {
    return (
      <div
        className={`bg-white border border-neutral-200 rounded-lg overflow-hidden ${className}`}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-neutral-50 hover:bg-neutral-100 transition-colors text-right"
        >
          <div className="flex items-center gap-2 flex-1">
            {Icon && <Icon size={18} className="text-primary-700 flex-shrink-0" />}
            <div className="flex-1">
              <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
              {description && (
                <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
              )}
            </div>
          </div>
          {isOpen ? (
            <ChevronDown size={16} className="text-neutral-500 flex-shrink-0" />
          ) : (
            <ChevronLeft size={16} className="text-neutral-500 flex-shrink-0" />
          )}
        </button>

        {isOpen && <div className="p-4">{children}</div>}
      </div>
    );
  }

  /* ─── وضع عادي (بدون طي) ─── */
  return (
    <div
      className={`bg-white border border-neutral-200 rounded-lg ${className}`}
    >
      {(title || Icon) && (
        <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 rounded-t-lg">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={18} className="text-primary-700 flex-shrink-0" />}
            <div className="flex-1">
              {title && (
                <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
              )}
              {description && (
                <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-4">{children}</div>
    </div>
  );
};

export default Section;