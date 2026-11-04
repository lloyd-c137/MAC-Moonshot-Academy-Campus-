export interface DisplayProfile {
  id: string;
  width: number;
  height: number;
  format: 'mono1';
  orientation: 'landscape' | 'portrait';
  bitOrder: 'msb_first';
  oneBit: 'black';
  strideBytes: number;
  driverName: string;
  panelModel?: string;
  scanDirection: 'top_to_bottom';
}

/** Software golden profile only. It is not a claim about the attached panel. */
export const MONO1_800X480_TEST: DisplayProfile = {
  id: 'mono1-800x480-test-v1', width: 800, height: 480, format: 'mono1', orientation: 'landscape',
  bitOrder: 'msb_first', oneBit: 'black', strideBytes: 100, driverName: 'unassigned-test-profile', scanDirection: 'top_to_bottom',
};

export function displayProfile(width: number, height: number, id: string): DisplayProfile {
  return { ...MONO1_800X480_TEST, id, width, height, strideBytes: Math.ceil(width / 8), orientation: width >= height ? 'landscape' : 'portrait' };
}
