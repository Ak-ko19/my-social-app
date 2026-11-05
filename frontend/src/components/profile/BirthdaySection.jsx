import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveBirthday } from '../../services/profileService';
import { serverErrorText } from '../../utils/serverError';
import { daysIn, monthName } from '../../utils/birthday';

const AUDIENCES = ['only_me', 'friends', 'public'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// Day 111: Edit profile > Birthday -- the month and the day (never a year)
// and who sees it. Saved on its own (like the cover photo), not with the
// form above. `initial`: { month, day, audience } from /profile/me.
function BirthdaySection({ initial, token }) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(initial.month || '');
  const [day, setDay] = useState(initial.day || '');
  const [audience, setAudience] = useState(initial.audience || 'friends');
  const [saved, setSaved] = useState(Boolean(initial.month));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const pickMonth = (value) => {
    const m = Number(value) || '';
    setMonth(m);
    // A day that month doesn't have (31 April) is let go.
    if (m && day && day > daysIn(m)) setDay('');
  };

  const send = async (body, done) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await saveBirthday(body, token);
      setSaved(Boolean(result.birthday));
      setStatus(done);
    } catch (err) {
      setError(serverErrorText(err, 'birthday.failed'));
    } finally {
      setBusy(false);
    }
  };

  const save = (e) => {
    e.preventDefault();
    if (!month || !day) {
      setError(t('birthday.pickBoth'));
      return;
    }
    send({ month, day, audience }, t('birthday.saved'));
  };
  const remove = () => {
    send({ month: null, day: null }, t('birthday.removed'));
    setMonth('');
    setDay('');
  };

  return (
    <section className="edit-profile-birthday" aria-labelledby="birthday-heading">
      <h2 id="birthday-heading" className="section-heading">{t('birthday.title')}</h2>
      <p className="form-hint">{t('birthday.explain')}</p>
      <form className="form-stack" onSubmit={save} noValidate>
        <div className="edit-profile-birthday-row">
          <label className="form-field">
            <span className="form-label">{t('birthday.month')}</span>
            <select className="form-input" value={month} onChange={(e) => pickMonth(e.target.value)}>
              <option value="">{t('birthday.choose')}</option>
              {MONTHS.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">{t('birthday.day')}</span>
            <select className="form-input" value={day} onChange={(e) => setDay(Number(e.target.value) || '')}>
              <option value="">{t('birthday.choose')}</option>
              {Array.from({ length: month ? daysIn(month) : 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
        <label className="form-field">
          <span className="form-label">{t('birthday.audience')}</span>
          <select className="form-input" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => <option key={a} value={a}>{t(`birthday.audiences.${a}`)}</option>)}
          </select>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="edit-profile-birthday-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{t('birthday.save')}</button>
          {saved && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={remove} disabled={busy}>{t('birthday.remove')}</button>
          )}
        </div>
        <p className="form-success" role="status">{status}</p>
      </form>
    </section>
  );
}

export default BirthdaySection;
