import { Children, isValidElement } from 'react';

interface SettingsSectionProps {
  id: string;
  title: string;
  innerRef?: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

export default function SettingsSection({ id, title, innerRef, children }: SettingsSectionProps) {
  return (
    <div
      id={id}
      ref={innerRef}
      className="bg-white border border-stone-200/60 rounded-2xl overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-stone-100">
        <p className="text-[10.5px] font-semibold text-stone-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="divide-y divide-stone-100/60">
        {Children.toArray(children).filter(isValidElement).map((child, i) => (
          <div key={i} className="px-6 py-4">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
