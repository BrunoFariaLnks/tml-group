// Official UK rates. Update once per tax year.
export const RATES = {
  ct: { financialYear: '2026', smallRate: 0.19, mainRate: 0.25, lowerLimit: 5000000, upperLimit: 25000000, reliefFraction: 3 / 200 },
  dividend: {
    taxYear: '2026/27', allowance: 50000, personalAllowance: 1257000, basicBandWidth: 3770000,
    taperStart: 10000000, additionalThreshold: 12514000, basic: 0.1075, higher: 0.3575, additional: 0.3935,
  },
};
