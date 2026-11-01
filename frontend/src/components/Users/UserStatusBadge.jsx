/**
 * @file UserStatusBadge.jsx
 * @description شارة حالة المستخدم (نشط / معطّل).
 */

export default function UserStatusBadge({ isActive }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
        isActive
          ? 'bg-success-100 text-success-800'
          : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isActive ? 'bg-success-500' : 'bg-neutral-400'
        }`}
      />
      {isActive ? 'نشط' : 'معطّل'}
    </span>
  );
}