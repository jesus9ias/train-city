/** Run-length encodes a list: ['a','a','b'] → [['a',2],['b',1]]. */
export function encodeRuns(values: readonly string[]): [string, number][] {
  const runs: [string, number][] = [];
  for (const value of values) {
    const last = runs.at(-1);
    if (last?.[0] === value) last[1] += 1;
    else runs.push([value, 1]);
  }
  return runs;
}

export function decodeRuns(runs: readonly (readonly [string, number])[]): string[] {
  return runs.flatMap(([value, count]) => new Array<string>(count).fill(value));
}
