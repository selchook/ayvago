/** The year ayvago.com launched; the copyright notice starts here. */
export const LAUNCH_YEAR = 2026;

/**
 * The years of the footer's copyright notice: the launch year alone in the launch year, then a
 * range up to the current year ("2026", later "2026–2027", with an en dash).
 */
export function copyrightYears(year: number, launchYear: number = LAUNCH_YEAR): string {
  return year > launchYear ? `${launchYear}–${year}` : String(launchYear);
}
