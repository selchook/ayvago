// Build-time ad configuration (NEXT_PUBLIC_* values are inlined; all of them are public by design,
// they appear in the ad tag of every page that shows ads). Without the client ID the ad code stays
// completely inert: no settings read, no script, no consent calls (docs/setup/phase-3.md).

/** AdSense publisher ID for H5 Games Ads, "ca-pub-…". */
export const ADSENSE_CLIENT = readClient(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);

/** Ad unit ID of the desktop side-column banner (a display ad unit in AdSense). Optional. */
export const ADSENSE_BANNER_SLOT = readSlot(process.env.NEXT_PUBLIC_ADSENSE_BANNER_SLOT);

/** The contact for privacy and KVKK requests shown on the privacy page. Optional. */
/** The privacy contact; `NEXT_PUBLIC_PRIVACY_CONTACT` overrides the owner's default address. */
export const PRIVACY_CONTACT =
  (process.env.NEXT_PUBLIC_PRIVACY_CONTACT ?? '').trim() || 'ayvagogames@gmail.com';

function readClient(value: string | undefined): string {
  const id = (value ?? '').trim();
  return /^ca-pub-\d{10,20}$/.test(id) ? id : '';
}

function readSlot(value: string | undefined): string {
  const id = (value ?? '').trim();
  return /^\d{6,20}$/.test(id) ? id : '';
}
