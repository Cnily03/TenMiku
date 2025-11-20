import { KANA_TO_ROMAN, KATA_TO_ROMAN } from "@/constants";

interface Token {
  original: string;
  extend: string[];
  matched_weight?: number;
}

/**
 * 将日语假名转换为罗马音
 * 支持平假名和片假名的混合输入
 */
function convertToTokensWithRoman(text: string): Token[] {
  const result: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    // 如果是 \s，将后面的几个 \s+ 一起作为一个 token
    if (/\s/.test(char)) {
      let spaceSeq = char;
      i++;
      while (i < text.length && /\s/.test(text[i]!)) {
        spaceSeq += text[i]!;
        i++;
      }
      result.push({ original: spaceSeq, extend: [" "] });
      continue;
    }

    // 尝试匹配两个字符的组合（如 "しゃ" -> "sha"）
    if (i + 1 < text.length) {
      const twoChar = text.slice(i, i + 2);
      const twoCharRoman =
        KANA_TO_ROMAN[twoChar as keyof typeof KANA_TO_ROMAN] || KATA_TO_ROMAN[twoChar as keyof typeof KATA_TO_ROMAN];
      if (twoCharRoman) {
        result.push({ original: twoChar, extend: [twoCharRoman] });
        i += 2;
        continue;
      }
    }

    // 尝试匹配单个字符
    const romanChar =
      KANA_TO_ROMAN[char as keyof typeof KANA_TO_ROMAN] || KATA_TO_ROMAN[char as keyof typeof KATA_TO_ROMAN];
    if (romanChar) {
      result.push({ original: char, extend: [romanChar] });
    } else {
      result.push({ original: char, extend: [] });
    }
    i += 1;
  }

  return result;
}

/**
 * 生成搜索索引：将混合输入转换为可搜索的格式
 * 例如 "sokoni 在hikari" -> ["sokoni", "在", "hikari"]
 */
function generateTokens(text: string): Token[] {
  return text
    .toLowerCase()
    .trim()
    .split(/\b/)
    .filter((k) => k.length > 0)
    .flatMap((k) => convertToTokensWithRoman(k));
}

/**
 * 检查两个 token 是否匹配
 * 返回匹配的基础权重：1.0 (original-original), 0.9 (original-extend), 0.8 (extend-extend)
 * 如果不匹配返回 0
 */
function getTokenMatchWeight(input: Token, target: Token): number {
  // 检查 original 与 original
  if (input.original === target.original) {
    return 1.0;
  }

  // 检查 original 与 target.extend
  if (target.extend.includes(input.original)) {
    return 0.9;
  }

  // 检查 input.extend 与 target.original
  if (input.extend.includes(target.original)) {
    return 0.9;
  }

  // 检查 input.extend 与 target.extend
  for (const inputExt of input.extend) {
    if (target.extend.includes(inputExt)) {
      return 0.8;
    }
  }

  return 0;
}

/**
 * 检查多个连续的 input tokens 是否可以组合匹配一个 target token
 * 返回最优权重，如果无法匹配返回 0
 */
function getMultiTokenMatchWeight(
  inputTokens: Token[],
  startIdx: number,
  endIdx: number, // 不包括 endIdx
  target: Token
): number {
  if (startIdx >= endIdx) {
    return 0;
  }

  // 组合多个 input token 的 original
  const combinedOriginal = inputTokens
    .slice(startIdx, endIdx)
    .map((t) => t.original)
    .join("");

  // 组合多个 input token 的所有 extend
  const combinedExtends: string[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    combinedExtends.push(...inputTokens[i]!.extend);
  }

  // 检查 combined original 与 target original
  if (combinedOriginal === target.original) {
    return 1.0;
  }

  // 检查 combined original 与 target.extend
  if (target.extend.includes(combinedOriginal)) {
    return 0.9;
  }

  // 检查 combined extends 与 target.original
  const combinedExtendsStr = combinedExtends.join("");
  if (combinedExtendsStr === target.original) {
    return 0.9;
  }

  // 检查 combined extends 与 target.extend
  if (target.extend.includes(combinedExtendsStr)) {
    return 0.8;
  }

  return 0;
}

interface MatchingStrategy {
  matches: Array<{ inputRange: [number, number]; targetIdx: number; weight: number }>;
  reversedCount: number;
  score: number;
}

/**
 * 动态规划计算最优匹配策略
 * 支持多个 input token 匹配一个 target token
 * 支持顺序匹配、倒序匹配、隔字匹配
 */
function findOptimalMatching(inputTokens: Token[], targetTokens: Token[]): MatchingStrategy {
  const m = inputTokens.length;
  const n = targetTokens.length;

  // dp[i][j][reversed] = { matches, reversedCount }
  // 表示匹配到 input 的第 i 个、target 的第 j 个，是否启用了倒序的最优状态
  const dp: Array<
    Array<
      Array<{
        matches: Array<{ inputRange: [number, number]; targetIdx: number; weight: number }>;
        reversedCount: number;
      } | null>
    >
  > = Array(m + 1)
    .fill(null)
    .map(() =>
      Array(n + 1)
        .fill(null)
        .map(() => [null, null])
    );

  // 初始化
  dp[0]![0]![0] = { matches: [], reversedCount: 0 };

  // 填充 DP 表
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (i > 0 && j > 0) {
        // 尝试单个 input token 匹配
        const singleWeight = getTokenMatchWeight(inputTokens[i - 1]!, targetTokens[j - 1]!);
        if (singleWeight > 0) {
          for (let reversed = 0; reversed <= 1; reversed++) {
            const prev = dp[i - 1]![j - 1]![reversed];
            if (prev) {
              const newMatches = [
                ...prev.matches,
                { inputRange: [i - 1, i] as [number, number], targetIdx: j - 1, weight: singleWeight },
              ];
              if (
                !dp[i]![j]![reversed] ||
                calculateScore(newMatches, prev.reversedCount, n) >
                  calculateScore(dp[i]![j]![reversed]!.matches, dp[i]![j]![reversed]!.reversedCount, n)
              ) {
                dp[i]![j]![reversed] = {
                  matches: newMatches,
                  reversedCount: prev.reversedCount,
                };
              }
            }
          }
        }

        // 尝试多个 input tokens 匹配一个 target token
        for (let startI = 0; startI < i; startI++) {
          const multiWeight = getMultiTokenMatchWeight(inputTokens, startI, i, targetTokens[j - 1]!);
          if (multiWeight > 0) {
            for (let reversed = 0; reversed <= 1; reversed++) {
              const prev = dp[startI]![j - 1]![reversed];
              if (prev) {
                const newMatches = [
                  ...prev.matches,
                  { inputRange: [startI, i] as [number, number], targetIdx: j - 1, weight: multiWeight },
                ];
                if (
                  !dp[i]![j]![reversed] ||
                  calculateScore(newMatches, prev.reversedCount, n) >
                    calculateScore(dp[i]![j]![reversed]!.matches, dp[i]![j]![reversed]!.reversedCount, n)
                ) {
                  dp[i]![j]![reversed] = {
                    matches: newMatches,
                    reversedCount: prev.reversedCount,
                  };
                }
              }
            }
          }
        }
      }

      // 尝试倒序匹配（向后查找已匹配过的 target）
      if (i > 0) {
        for (let jPrev = j; jPrev > 0; jPrev--) {
          const singleWeight = getTokenMatchWeight(inputTokens[i - 1]!, targetTokens[jPrev - 1]!);
          if (singleWeight > 0) {
            const prev = dp[i - 1]![jPrev]![0]; // 倒序从非倒序状态转移
            if (prev) {
              const newMatches = [
                ...prev.matches,
                { inputRange: [i - 1, i] as [number, number], targetIdx: jPrev - 1, weight: singleWeight },
              ];
              const newReversedCount = prev.reversedCount + 1;
              if (
                !dp[i]![j]![1] ||
                calculateScore(newMatches, newReversedCount, n) >
                  calculateScore(dp[i]![j]![1]!.matches, dp[i]![j]![1]!.reversedCount, n)
              ) {
                dp[i]![j]![1] = {
                  matches: newMatches,
                  reversedCount: newReversedCount,
                };
              }
            }
          }

          // 倒序中的多 token 匹配
          for (let startI = 0; startI < i; startI++) {
            const multiWeight = getMultiTokenMatchWeight(inputTokens, startI, i, targetTokens[jPrev - 1]!);
            if (multiWeight > 0) {
              const prev = dp[startI]![jPrev]![0];
              if (prev) {
                const newMatches = [
                  ...prev.matches,
                  { inputRange: [startI, i] as [number, number], targetIdx: jPrev - 1, weight: multiWeight },
                ];
                const newReversedCount = prev.reversedCount + 1;
                if (
                  !dp[i]![j]![1] ||
                  calculateScore(newMatches, newReversedCount, n) >
                    calculateScore(dp[i]![j]![1]!.matches, dp[i]![j]![1]!.reversedCount, n)
                ) {
                  dp[i]![j]![1] = {
                    matches: newMatches,
                    reversedCount: newReversedCount,
                  };
                }
              }
            }
          }
        }
      }

      // 隔字匹配（跳过当前 target）
      if (j > 0) {
        for (let reversed = 0; reversed <= 1; reversed++) {
          const prev = dp[i]![j - 1]![reversed];
          if (prev) {
            if (
              !dp[i]![j]![reversed] ||
              calculateScore(prev.matches, prev.reversedCount, n) >
                calculateScore(dp[i]![j]![reversed]!.matches, dp[i]![j]![reversed]!.reversedCount, n)
            ) {
              dp[i]![j]![reversed] = prev;
            }
          }
        }
      }

      // 漏字匹配（跳过当前 input）
      if (i > 0) {
        for (let reversed = 0; reversed <= 1; reversed++) {
          const prev = dp[i - 1]![j]![reversed];
          if (prev) {
            if (
              !dp[i]![j]![reversed] ||
              calculateScore(prev.matches, prev.reversedCount, n) >
                calculateScore(dp[i]![j]![reversed]!.matches, dp[i]![j]![reversed]!.reversedCount, n)
            ) {
              dp[i]![j]![reversed] = prev;
            }
          }
        }
      }
    }
  }

  // 找到最优解
  let bestMatches: Array<{ inputRange: [number, number]; targetIdx: number; weight: number }> = [];
  let bestReversedCount = 0;
  let bestScore = -1;

  for (let reversed = 0; reversed <= 1; reversed++) {
    const state = dp[m]![n]![reversed];
    if (state) {
      const score = calculateScore(state.matches, state.reversedCount, n);
      if (score > bestScore) {
        bestScore = score;
        bestMatches = state.matches;
        bestReversedCount = state.reversedCount;
      }
    }
  }

  // 应用倒序惩罚
  for (const match of bestMatches) {
    const reversePenalty = 1 - bestReversedCount / n;
    match.weight *= reversePenalty;
  }

  return {
    matches: bestMatches,
    reversedCount: bestReversedCount,
    score: bestScore,
  };
}

function calculateScore(
  matches: Array<{ inputRange: [number, number]; targetIdx: number; weight: number }>,
  _reversedCount: number,
  targetTokenCount: number
): number {
  const totalWeight = matches.reduce((sum, m) => sum + m.weight, 0);
  return totalWeight / targetTokenCount;
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];

  // 先按起始位置排序
  ranges.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    if (merged.length === 0 || merged[merged.length - 1]![1] < range[0]) {
      merged.push(range);
    } else {
      merged[merged.length - 1]![1] = Math.max(merged[merged.length - 1]![1], range[1]);
    }
  }

  return merged;
}

interface FuzzyMatchResult {
  score: number;
  input: string;
  target: string;
  ranges: {
    input: Array<[number, number]>;
    target: Array<[number, number]>;
  };
}

/**
 * 模糊匹配混合搜索
 * 支持日语假名、罗马音和中文的混合搜索
 * 支持漏字、倒序、隔字匹配
 * 支持多个 input token 匹配一个 target token
 */
export function fuzzyMatchMixed(userInput: string, targetText: string): FuzzyMatchResult {
  const inputTokens = generateTokens(userInput);
  const targetTokens = generateTokens(targetText);
  const o: FuzzyMatchResult = {
    score: 0,
    input: userInput,
    target: targetText,
    ranges: {
      input: [],
      target: [],
    },
  };

  if (targetTokens.length === 0) return o;

  const strategy = findOptimalMatching(inputTokens, targetTokens);

  // 标记 matched_weight
  for (const match of strategy.matches) {
    const [startIdx, endIdx] = match.inputRange;
    for (let i = startIdx; i < endIdx; i++) {
      inputTokens[i]!.matched_weight = Math.max(
        match.weight / (endIdx - startIdx),
        inputTokens[i]!.matched_weight || 0
      );
    }
    targetTokens[match.targetIdx]!.matched_weight = match.weight;
  }

  // 计算漏字数
  const mergedInputRanges = mergeRanges(strategy.matches.map((m) => m.inputRange));
  let matchedInputCount = 0;
  for (const [start, end] of mergedInputRanges) {
    matchedInputCount += end - start;
  }
  const missedInputCount = inputTokens.length - matchedInputCount;
  const mergedTargetRanges = mergeRanges(
    strategy.matches.map((m) => [m.targetIdx, m.targetIdx + 1] as [number, number])
  );

  // 生成 userInput 中匹配的范围
  const matchingInputRanges: Array<[number, number]> = (() => {
    const leadingSpaces = userInput.length - userInput.trimStart().length;
    const prefixSums: number[] = [leadingSpaces];
    for (let i = 0; i < inputTokens.length; i++) {
      prefixSums.push(prefixSums[i]! + inputTokens[i]!.original.length);
    }
    const ranges: Array<[number, number]> = [];
    for (const [start, end] of mergedInputRanges) {
      ranges.push([prefixSums[start]!, prefixSums[end]!]);
    }
    return ranges;
  })();

  // 生成 targetText 中匹配的范围
  const matchingTargetRanges: Array<[number, number]> = (() => {
    const leadingSpaces = targetText.length - targetText.trimStart().length;
    const prefixSums: number[] = [leadingSpaces];
    for (let i = 0; i < targetTokens.length; i++) {
      prefixSums.push(prefixSums[i]! + targetTokens[i]!.original.length);
    }
    const ranges: Array<[number, number]> = [];
    for (const [start, end] of mergedTargetRanges) {
      ranges.push([prefixSums[start]!, prefixSums[end]!]);
    }
    return ranges;
  })();

  // 计算最终评分
  const weightSum = strategy.matches.reduce((sum, m) => sum + m.weight, 0);
  const baseScore = weightSum / targetTokens.length;
  const missedPenalty = 0.9 ** missedInputCount;
  const score = baseScore * missedPenalty;

  o.score = score;
  o.ranges.input = matchingInputRanges;
  o.ranges.target = matchingTargetRanges;
  return o;
}
