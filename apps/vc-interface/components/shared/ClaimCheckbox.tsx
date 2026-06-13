'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@prisma-events/dids-ui';

export interface ClaimCheckboxProps {
  claimKey: string;
  value: string | number | boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  alwaysVisible?: boolean;
}

export function ClaimCheckbox({
  claimKey,
  value,
  checked,
  onChange,
  disabled = false,
  alwaysVisible = false,
}: ClaimCheckboxProps) {
  const t = useTranslations('common');

  const formatValue = (val: string | number | boolean): string => {
    if (typeof val === 'boolean') return val ? t('yes') : t('no');
    return String(val);
  };

  const handleClick = () => {
    if (!disabled && !alwaysVisible) {
      onChange(!checked);
    }
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3.5 rounded-lg border transition-all',
        checked
          ? 'bg-primary/5 border-primary/20'
          : 'bg-background border-border',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
      onClick={handleClick}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled || alwaysVisible}
        className="mt-0.5 w-[18px] h-[18px] accent-primary cursor-pointer disabled:cursor-not-allowed"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1 flex flex-col gap-1">
        <span className="text-xs text-text-secondary font-medium capitalize">
          {claimKey.replace(/([A-Z])/g, ' $1').trim()}
          {alwaysVisible && (
            <span className="ml-2 text-[0.65rem] px-1.5 py-0.5 rounded bg-success/15 text-success font-semibold">
              {t('alwaysVisible')}
            </span>
          )}
        </span>
        <span className="text-[0.95rem] text-text-primary break-words">
          {formatValue(value)}
        </span>
      </div>
    </div>
  );
}
