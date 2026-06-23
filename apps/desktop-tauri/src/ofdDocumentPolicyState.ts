export type OfdPageLimitPresetId = "stable" | "extended" | "long_experimental";

export type OfdPageLimitPreset = {
  id: OfdPageLimitPresetId;
  label: string;
  maxPages: number;
  allowsContinuousView: boolean;
  description: string;
};

export type OfdOpenPolicyInput = {
  pageCount: number;
  presetId: OfdPageLimitPresetId;
};

export type OfdOpenPolicy = {
  allowed: boolean;
  preset: OfdPageLimitPreset;
  message: string;
};

export const defaultOfdPageLimitPresetId: OfdPageLimitPresetId = "stable";

export const ofdPageLimitPresets: OfdPageLimitPreset[] = [
  {
    id: "stable",
    label: "稳定模式（最多 20 页）",
    maxPages: 20,
    allowsContinuousView: true,
    description: "推荐。完整支持 OFD 单页、连续阅读、页码跳转和查找，优先保证阅读器稳定。",
  },
  {
    id: "extended",
    label: "扩展模式（最多 50 页）",
    maxPages: 50,
    allowsContinuousView: true,
    description: "适合中等页数 OFD。可能出现短暂等待，连续模式体验取决于文档复杂度。",
  },
  {
    id: "long_experimental",
    label: "长文档实验模式（最多 200 页）",
    maxPages: 200,
    allowsContinuousView: false,
    description: "仅建议在必须打开长 OFD 时使用。开启后将禁用 OFD 连续模式，只保留单页阅读、页码跳转和基础查找；打开和翻页可能明显变慢。后续 OFD 引擎升级后会重新评估默认上限和连续阅读能力。",
  },
];

export function ofdPageLimitPresetById(presetId: OfdPageLimitPresetId): OfdPageLimitPreset {
  return ofdPageLimitPresets.find((preset) => preset.id === presetId)
    ?? ofdPageLimitPresets[0];
}

export function canUseOfdContinuousViewForPreset(presetId: OfdPageLimitPresetId): boolean {
  return ofdPageLimitPresetById(presetId).allowsContinuousView;
}

export function ofdOpenPolicyForPageCount(input: OfdOpenPolicyInput): OfdOpenPolicy {
  const preset = ofdPageLimitPresetById(input.presetId);
  if (input.pageCount <= preset.maxPages) {
    return {
      allowed: true,
      preset,
      message: "",
    };
  }

  return {
    allowed: false,
    preset,
    message: `该 OFD 文档共有 ${input.pageCount} 页，当前 OFD 页数上限为 ${preset.maxPages} 页。为保证阅读器稳定，当前版本不会直接打开超过上限的 OFD。你可以在“更多”里的 OFD 性能设置中提高上限，但大文档可能出现打开慢、翻页慢或连续模式不可用等体验问题。`,
  };
}
