import { useTranslation } from 'react-i18next';
import { useTimezone } from '../contexts/TimezoneContext';

/**
 * Returns a formatting function: (iso: string | null, dateOnly?: boolean) => string
 *
 * - dateOnly=false (default): year/month/day + hour:minute
 * - dateOnly=true:            year/month/day only
 * - timezone 'utc'   → timeZone: 'UTC'
 * - timezone 'local' → timeZone: 'Asia/Tokyo'
 * - locale:  i18n.language === 'en' ? 'en-US' : 'ja-JP'
 */
export function useFormatDate() {
  const { i18n } = useTranslation();
  const { timezone } = useTimezone();

  return function formatDate(iso: string | null, dateOnly = false): string {
    if (!iso) return '-';
    const locale   = i18n.language === 'en' ? 'en-US' : 'ja-JP';
    const timeZone = timezone === 'utc' ? 'UTC' : 'Asia/Tokyo';

    if (dateOnly) {
      return new Date(iso).toLocaleDateString(locale, {
        year: 'numeric', month: 'numeric', day: 'numeric',
        timeZone,
      });
    }

    return new Date(iso).toLocaleString(locale, {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone,
    });
  };
}
