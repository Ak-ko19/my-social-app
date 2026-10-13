import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Database, Flag, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import FeedErrorState from '../feed/FeedErrorState';
import { fetchOverview } from '../../services/adminService';
import { formatPercent } from '../../utils/formatBytes';
import './AdminOverviewPanel.css';

const RANGES = [7, 30, 90];
const METRICS = ['signups', 'posts', 'comments', 'reports'];
const TOTALS = ['users', 'posts', 'comments', 'groups', 'pages'];

// Latin digits in Arabic too, like formatDate and formatBytes.
const locale = () => (i18n.language === 'ar' ? 'ar-u-nu-latn' : undefined);
const formatCount = (n) => Number(n).toLocaleString(locale());
// A day from the API ("2026-10-13", a UTC day) as "Oct 13".
const formatDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale(), { month: 'short', day: 'numeric', timeZone: 'UTC' });

// One metric's bars, oldest to newest in the reading direction (so in
// Arabic the newest day is on the left). Today, still counting, is paler.
// Screen readers get the summary label, and the table below has every day.
function BarChart({ series, metric, label, rtl }) {
  const values = series.map((p) => p[metric]);
  const max = Math.max(1, ...values);
  const n = series.length;
  return (
    <svg className="overview-chart" viewBox={`0 0 ${n * 10} 60`} preserveAspectRatio="none" role="img" aria-label={label}>
      {series.map((p, i) => {
        const h = (p[metric] / max) * 56;
        const x = (rtl ? n - 1 - i : i) * 10 + 1;
        return (
          <rect key={p.day} className={clsx('overview-bar', i === n - 1 && 'is-today')} x={x} y={60 - Math.max(h, 1)} width={8} height={Math.max(h, 1)}>
            <title>{`${formatDay(p.day)}: ${formatCount(p[metric])}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// Day 61: Admin > Overview. How the app is doing: totals, what needs
// attention (reports, errors, storage) with a shortcut to each, and daily
// signups / posts / comments / reports over 7, 30 or 90 days.
function AdminOverviewPanel({ token, onOpenSection }) {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchOverview(token, days)
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [token, days]);
  useEffect(load, [load]);
  const refresh = () => {
    setLoading(true);
    load();
  };
  const choose = (range) => {
    if (range === days) return;
    setLoading(true);
    setDays(range);
  };

  if (failed) return <FeedErrorState message={t('admin.overview.loadFailed')} onRetry={refresh} />;
  if (!data) return <p className="screen-status" role="status">{t('common.loading')}</p>;

  const { series, totals, storage } = data;
  const rtl = i18n.dir() === 'rtl';
  const sum = (metric) => series.reduce((s, p) => s + p[metric], 0);
  const storageLevel = [storage.database.level, storage.cloudinary.level].includes('alert') ? 'alert'
    : [storage.database.level, storage.cloudinary.level].includes('warn') ? 'warn' : 'ok';

  return (
    <div className="overview-panel">
      <section className="overview-totals" aria-label={t('admin.overview.totalsLabel')}>
        {TOTALS.map((key) => {
          const total = totals[key];
          const count = typeof total === 'object' ? total.count : total;
          const estimated = typeof total === 'object' && total.estimated;
          return (
            <div key={key} className="overview-total">
              <span className="overview-total-value">{estimated ? t('admin.overview.about', { count: formatCount(count) }) : formatCount(count)}</span>
              <span className="overview-total-label">{t(`admin.overview.total.${key}`)}</span>
            </div>
          );
        })}
      </section>

      <section className="overview-attention" aria-label={t('admin.overview.attentionLabel')}>
        <button type="button" className={clsx('overview-link', totals.pendingReports > 0 && 'is-warn')} onClick={() => onOpenSection('reports')}>
          <Flag size={18} aria-hidden="true" />
          <span>{t('admin.overview.pendingReports', { count: totals.pendingReports, n: formatCount(totals.pendingReports) })}</span>
          <ChevronRight size={18} className="overview-link-chevron" aria-hidden="true" />
        </button>
        <button type="button" className={clsx('overview-link', totals.openErrors > 0 && 'is-warn')} onClick={() => onOpenSection('errors')}>
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{t('admin.overview.openErrors', { count: totals.openErrors, n: formatCount(totals.openErrors) })}</span>
          <ChevronRight size={18} className="overview-link-chevron" aria-hidden="true" />
        </button>
        <button type="button" className={clsx('overview-link', storageLevel !== 'ok' && `is-${storageLevel}`)} onClick={() => onOpenSection('storage')}>
          <Database size={18} aria-hidden="true" />
          <span>
            {t('admin.overview.storageLine', {
              database: storage.database.percent === null ? '?' : formatPercent(storage.database.percent),
              media: storage.cloudinary.percent === null ? t('admin.overview.notKnown') : formatPercent(storage.cloudinary.percent)
            })}
          </span>
          <ChevronRight size={18} className="overview-link-chevron" aria-hidden="true" />
        </button>
      </section>

      <div className="overview-range" role="group" aria-label={t('admin.overview.rangeLabel')}>
        {RANGES.map((r) => (
          <button key={r} type="button" className={clsx('overview-range-btn', days === r && 'is-active')} aria-pressed={days === r} onClick={() => choose(r)} disabled={loading && days !== r}>
            {t('admin.overview.lastDays', { count: r, n: formatCount(r) })}
          </button>
        ))}
      </div>

      {METRICS.map((metric) => {
        const title = t(`admin.overview.metric.${metric}`);
        const summary = t('admin.overview.inRange', { n: formatCount(sum(metric)) });
        return (
          <section key={metric} className="overview-card" aria-labelledby={`overview-${metric}`}>
            <div className="overview-card-head">
              <h2 id={`overview-${metric}`} className="overview-card-title">{title}</h2>
              <span className="overview-card-sum">{summary}</span>
            </div>
            <BarChart series={series} metric={metric} rtl={rtl} label={`${title}: ${summary}`} />
            <div className="overview-axis" aria-hidden="true">
              <span>{formatDay(series[0].day)}</span>
              <span>{t('admin.overview.today')}</span>
            </div>
          </section>
        );
      })}

      <details className="overview-table-wrap">
        <summary>{t('admin.overview.showTable')}</summary>
        <table className="overview-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.overview.day')}</th>
              {METRICS.map((m) => <th key={m} scope="col">{t(`admin.overview.metric.${m}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((p, i) => (
              <tr key={p.day}>
                <th scope="row">{i === 0 ? t('admin.overview.todaySoFar') : formatDay(p.day)}</th>
                {METRICS.map((m) => <td key={m}>{formatCount(p[m])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="overview-note">{t('admin.overview.utcNote')}</p>

      <button type="button" className="btn btn-secondary btn-block" onClick={refresh} disabled={loading}>
        <RefreshCw size={16} aria-hidden="true" /> {loading ? t('common.loading') : t('admin.overview.refresh')}
      </button>
    </div>
  );
}

export default AdminOverviewPanel;
