import DayJS from "dayjs";

export const parseFlightTime = (value: string) => {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    return null;
  }
  const calendarDate = value.slice(0, 10);
  const time = DayJS(value);
  return time.isValid() && DayJS(calendarDate).format("YYYY-MM-DD") === calendarDate ? time : null;
};
