export type FxTrackId = 'serum' | 'subbass' | 'beatbox' | 'ts666' | 'bassremix';

export type FxCategoryId =
  | 'distortion'
  | 'saturation'
  | 'filter'
  | 'eq'
  | 'compressor'
  | 'reverb'
  | 'delay'
  | 'chorus'
  | 'phaser'
  | 'flanger'
  | 'stereo'
  | 'limiter'
  | 'cabinet'
  | 'tremolo';

export interface ModularFxInstance {
  id: string;
  type: FxCategoryId;
  name: string;
  enabled: boolean;
  expanded?: boolean;
  params: Record<string, number>;
}

export interface FxParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  bipolar?: boolean;
  logarithmic?: boolean;
  primary?: boolean; // Shown directly in compact horizontal module card
  options?: string[]; // Enum selector when shown in detail panel
  formatValue?: (val: number) => string;
}

export interface FxCategoryMeta {
  id: FxCategoryId;
  name: string;
  shortName: string;
  groupLabel: string;
  description: string;
  colorHex: string;
  headerBgClass: string;
  borderClass: string;
  activeRingClass: string;
  badgeClass: string;
  params: FxParamDef[];
}

export type ProjectDeviceFxState = Record<FxTrackId, ModularFxInstance[]>;

export interface FxChainPreset {
  id: string;
  name: string;
  description: string;
  isFactory?: boolean;
  modules: {
    type: FxCategoryId;
    name?: string;
    enabled: boolean;
    params: Record<string, number>;
  }[];
}
