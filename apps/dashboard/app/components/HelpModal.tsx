'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@prisma-dids/ui';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const sectionKeys = [
  'whatIsDID',
  'whyNeedOne',
  'howWallet',
  'howCreate',
  'howRevoke',
] as const;

export function HelpModal({ open, onClose }: HelpModalProps) {
  const t = useTranslations('help');

  return (
    <Modal open={open} onClose={onClose} title={t('title')} className="max-w-xl">
      <div className="space-y-5">
        {sectionKeys.map((key, i) => (
          <div key={key} className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {t(`${key}.q`)}
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {t(`${key}.a`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
