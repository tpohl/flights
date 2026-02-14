export function isWithinXDaysAgo(xDays: number, dateString: string): boolean {
  const inputDate = new Date(dateString);
  const currentDate = new Date();

  // Get the difference in time (milliseconds)
  const timeDifference = currentDate.getTime() - inputDate.getTime();

  // Convert milliseconds to days (1000 ms/s * 60 s/min * 60 min/h * 24 h/d)
  const dayDifference = timeDifference / (1000 * 60 * 60 * 24);

  // Check if the input date is within x days ago and not in the future
  return dayDifference <= xDays && dayDifference >= 0;
}
