/** Largest-remainder allocation: round the authoritative total once, then conserve each paise. */
export function allocatePaise(total: number, weights: number[]): number[] {
  if (!Number.isFinite(total) || weights.some(w => !Number.isFinite(w) || w < 0)) throw new Error("Invalid currency allocation");
  const paise = Math.round((Math.abs(total) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(paise)) throw new Error("Currency amount exceeds supported precision");
  const sum = weights.reduce((a,b)=>a+b,0);
  if (!weights.length) return [];
  const exact = weights.map(w => sum ? paise * w / sum : paise / weights.length);
  const result = exact.map(Math.floor);
  const order = exact.map((n,i)=>({i,remainder:n-result[i]})).sort((a,b)=>b.remainder-a.remainder || a.i-b.i);
  let left = paise-result.reduce((a,b)=>a+b,0);
  for(let i=0;left>0;i++,left--)result[order[i%order.length].i]++;
  return result.map(n=>(total<0?-n:n)/100);
}
