'use client';

import { useTranslations } from 'next-intl';
import { defaultConfig } from '@/config/org-config';
import { Card, Badge } from '@prisma-events/dids-ui';
import { Inbox, FileEdit, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const t = useTranslations('home');
  const tc = useTranslations('common');

  const cards = [
    {
      href: '/credentials',
      role: 'holder' as const,
      roleColor: 'success' as const,
      icon: <Inbox className="h-7 w-7 text-text-secondary" />,
      title: t('holderTitle'),
      desc: t('holderDesc'),
    },
    {
      href: '/issue',
      role: 'issuer' as const,
      roleColor: 'info' as const,
      icon: <FileEdit className="h-7 w-7 text-text-secondary" />,
      title: t('issuerTitle'),
      desc: t('issuerDesc'),
    },
    {
      href: '/manage',
      role: 'issuer' as const,
      roleColor: 'info' as const,
      icon: <Settings className="h-7 w-7 text-text-secondary" />,
      title: t('manageTitle'),
      desc: t('manageDesc'),
    },
    {
      href: '/verify',
      role: 'verifier' as const,
      roleColor: 'warning' as const,
      icon: <ShieldCheck className="h-7 w-7 text-text-secondary" />,
      title: t('verifyTitle'),
      desc: t('verifyDesc'),
    },
  ];

  return (
    <div className="max-w-[900px] mx-auto text-center py-12 px-4">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-text-primary mb-3">{defaultConfig.ORG_NAME}</h1>
        <h2 className="text-xl text-text-secondary mb-4">{t('subtitle')}</h2>
        <p className="text-text-secondary max-w-[600px] mx-auto">
          {t('description')}
        </p>
      </div>

      {/* Architecture Info */}
      <Card className="text-left p-5 mb-8 bg-primary/5 border-primary/20">
        <div className="font-semibold text-text-primary mb-2">{t('howItWorks')}</div>
        <div className="text-text-secondary text-sm leading-relaxed">
          <strong>{t('prerequisites')}:</strong>{' '}
          {t('prerequisitesDesc')}{' '}
          <a href="https://prisma-dids.io" className="text-primary hover:underline">
            {t('didDashboard')}
          </a>.
          <br />
          <strong>{t('flow')}:</strong> {t('flowDesc')}
        </div>
      </Card>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="no-underline">
            <Card className="p-6 text-left h-full hover:-translate-y-0.5 hover:border-primary/50 transition-all duration-200 cursor-pointer">
              <Badge variant={card.roleColor} className="mb-3 text-[0.65rem] uppercase">
                {tc(card.role)}
              </Badge>
              <div className="mb-3">{card.icon}</div>
              <h3 className="text-base font-semibold text-text-primary mb-2">{card.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{card.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
