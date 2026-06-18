export function calculateForecastAccuracy(historicalForecasts: any[], actuals: any[]) {
  // Mock logic combining snapshots of past forecasts with actual closed won amounts
  // In a real system, you would store monthly forecast snapshots in MongoDB.
  
  let totalForecasted = 0;
  let totalActual = 0;

  for (const f of historicalForecasts) {
    totalForecasted += f.predictedRevenue || 0;
  }
  for (const a of actuals) {
    totalActual += a.amount || 0;
  }

  const variance = totalActual - totalForecasted;
  const accuracyPercent = totalForecasted === 0 ? 0 : Math.min(100, Math.max(0, 100 - Math.abs((variance / totalForecasted) * 100)));

  return {
    forecastedRevenue: totalForecasted,
    actualRevenue: totalActual,
    variance,
    accuracyPercent: Math.round(accuracyPercent * 100) / 100,
    monthlyAccuracy: accuracyPercent, // Simplified
    quarterlyAccuracy: accuracyPercent, // Simplified
    yearlyAccuracy: accuracyPercent // Simplified
  };
}
