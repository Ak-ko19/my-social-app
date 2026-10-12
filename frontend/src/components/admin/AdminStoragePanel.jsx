import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Database, HardDrive, RefreshCw, Upload } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import FeedErrorState from '../feed/FeedErrorState';
import { fetchStorage } from '../../services/adminService';
import { formatBytes, formatPercent as pct } from '../../utils/formatBytes';
import './AdminStoragePanel.css';

// A "how full" bar: ok / warn / alert colours.
function Meter({ percent, level, label }) {
  const value = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div className="storage-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span className={clsx('storage-meter-fill', `is-${level}`)} style={{ inlineSize: `${value}%` }} />
    </div>
  );
}

// Day 57: Admin > Storage. How full the database and Cloudinary are on
// their free plans, what was uploaded in the last 24 hours and by whom,
// with a warning from 80 % and an alert from 95 %.
function AdminStoragePanel({ token }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchStorage(token)
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(load, [load]);
  const refresh = () => {
    setLoading(true);
    load();
  };

  if (failed) return <FeedErrorState message={t('admin.storage.loadFailed')} onRetry={refresh} />;
  if (!data) return <p className="screen-status" role="status">{t('common.loading')}</p>;

  const { database, cloudinary, uploads, warnings } = data;
  return (
    <div className="storage-panel">
      {warnings.map((w) => (
        <p key={w.source} className={clsx('storage-warning', `is-${w.level}`)} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          {t(`admin.storage.warning.${w.level}`, {
            what: t(`admin.storage.source.${w.source}`),
            percent: pct(w.source === 'database' ? database.percent : cloudinary.percent)
          })}
        </p>
      ))}

      <section className="storage-card" aria-labelledby="storage-db">
        <h2 id="storage-db" className="storage-card-title"><Database size={18} aria-hidden="true" /> {t('admin.storage.source.database')}</h2>
        <p className="storage-figure">
          {t('admin.storage.usedOf', { used: formatBytes(database.bytes), limit: formatBytes(database.limitBytes), percent: pct(database.percent) })}
        </p>
        <Meter percent={database.percent} level={database.level} label={t('admin.storage.source.database')} />
        <h3 className="storage-subtitle">{t('admin.storage.biggestTables')}</h3>
        <ul className="storage-list">
          {database.tables.map((table) => (
            <li key={table.name}><code dir="ltr">{table.name}</code><span>{formatBytes(table.bytes)}</span></li>
          ))}
        </ul>
      </section>

      <section className="storage-card" aria-labelledby="storage-media">
        <h2 id="storage-media" className="storage-card-title"><HardDrive size={18} aria-hidden="true" /> {t('admin.storage.source.cloudinary')}</h2>
        {!cloudinary.configured && <p className="storage-note">{t('admin.storage.notConfigured')}</p>}
        {cloudinary.configured && cloudinary.error && <p className="storage-note">{t('admin.storage.unavailable')}</p>}
        {cloudinary.configured && !cloudinary.error && (
          <>
            <p className="storage-figure">
              {t('admin.storage.credits', { used: cloudinary.creditsUsed ?? '?', limit: cloudinary.creditsLimit ?? '?', percent: pct(cloudinary.percent) })}
            </p>
            <Meter percent={cloudinary.percent} level={cloudinary.level} label={t('admin.storage.source.cloudinary')} />
            <ul className="storage-list">
              {cloudinary.storageBytes !== null && <li><span>{t('admin.storage.stored')}</span><span>{formatBytes(cloudinary.storageBytes)}</span></li>}
              {cloudinary.bandwidthBytes !== null && <li><span>{t('admin.storage.bandwidth')}</span><span>{formatBytes(cloudinary.bandwidthBytes)}</span></li>}
              {cloudinary.objects !== null && <li><span>{t('admin.storage.files')}</span><span>{cloudinary.objects}</span></li>}
            </ul>
          </>
        )}
      </section>

      <section className="storage-card" aria-labelledby="storage-uploads">
        <h2 id="storage-uploads" className="storage-card-title"><Upload size={18} aria-hidden="true" /> {t('admin.storage.uploadsTitle')}</h2>
        <p className="storage-figure">{t('admin.storage.uploadsTotal', { count: uploads.files, size: formatBytes(uploads.bytes) })}</p>
        {uploads.topUploaders.length > 0 && (
          <>
            <h3 className="storage-subtitle">{t('admin.storage.topUploaders')}</h3>
            <ul className="storage-list">
              {uploads.topUploaders.map((u) => (
                <li key={u.id}>
                  <span>{u.username}</span>
                  <span>{t('admin.storage.uploaderLine', { count: u.files, size: formatBytes(u.bytes) })}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <button type="button" className="btn btn-secondary btn-block" onClick={refresh} disabled={loading}>
        <RefreshCw size={16} aria-hidden="true" /> {loading ? t('common.loading') : t('admin.storage.refresh')}
      </button>
    </div>
  );
}

export default AdminStoragePanel;
