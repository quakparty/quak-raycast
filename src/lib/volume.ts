// The API takes 10 to 100: 10 is the quietest Sonos plays an announcement
export const MIN_VOLUME = 10;
export const MAX_VOLUME = 100;

export function isVolume(value: number) {
  return Number.isInteger(value) && value >= MIN_VOLUME && value <= MAX_VOLUME;
}
