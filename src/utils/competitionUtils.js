export const normalizeCompetitionSettings = (settings = {}) => ({
  isActive: Boolean(settings?.isActive),
  ticketPrice: Number(settings?.ticketPrice || 0),
  quota: Number(settings?.quota || 0),
  prizes: {
    first: Number(settings?.prizes?.first || 0),
    second: Number(settings?.prizes?.second || 0),
    third: Number(settings?.prizes?.third || 0),
  },
  startDate: settings?.startDate || '',
  endDate: settings?.endDate || '',
});

const parseDateOnly = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const isCompetitionVisible = (settings, now = new Date()) => {
  const normalized = normalizeCompetitionSettings(settings);

  if (!normalized.isActive) return false;

  const start = parseDateOnly(normalized.startDate);
  const end = parseDateOnly(normalized.endDate);

  if (!start && !end) return true;
  if (start && !end) return now >= start;
  if (!start && end) return now <= end;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
};

export const isCompetitionEnabled = (settings) => {
  return normalizeCompetitionSettings(settings).isActive;
};
