export const SECTION_IDS = {
  TOP: 'top',
  FEATURES: 'features',
  DEMO: 'demo',
  DOWNLOAD: 'download',
  DONATE: 'donate',
} as const;

const ANCHOR_MARK = '#';

const anchorOf = (sectionId: string): string => `${ANCHOR_MARK}${sectionId}`;

export const SECTION_ANCHORS = {
  TOP: anchorOf(SECTION_IDS.TOP),
  FEATURES: anchorOf(SECTION_IDS.FEATURES),
  DEMO: anchorOf(SECTION_IDS.DEMO),
  DOWNLOAD: anchorOf(SECTION_IDS.DOWNLOAD),
  DONATE: anchorOf(SECTION_IDS.DONATE),
} as const;
