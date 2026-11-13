=========================================================
ALGORITHM A : FUND QUALITY SCORE (LONG-TERM)
=========================================================

Purpose:
- Evaluate intrinsic quality of the fund.
- Designed to change slowly.
- Recalculate monthly or quarterly.
- Ignore current fund price, investor cost, and recent gains/losses.

Total Score: 60

---------------------------------------------------------
1. Fund Objective & Structure (10)
---------------------------------------------------------

Questions:
- Broad market exposure?
- Passive index or active?
- Clear investment mandate?
- Excess concentration?

Scoring:

MSCI World / ACWI                 = 9-10
S&P500                            = 9
NASDAQ100                         = 8
Developed single-country index   = 7
Sector Fund                       = 6-7
Single Theme Fund                 = 4-6

---------------------------------------------------------
2. Underlying Exposure Quality (10)
---------------------------------------------------------

Evaluate:

- Diversification
- Market depth
- Economic moat of holdings

Examples:

MSCI World                        = 10
S&P500                            = 9
NASDAQ100                         = 8
Developed single-country index   = 7
Single Country Emerging Market    = 6
Single Theme                      = 4

Examples of developed single-country indices: Nikkei 225, TOPIX, MSCI Japan.

---------------------------------------------------------
3. Risk Stability (10)
---------------------------------------------------------

Using:

5-Year Std Dev
5-Year Max Drawdown

Example:

Std Dev < 12%                     = 10
12-15%                            = 8
15-20%                            = 7
20-25%                            = 5
>25%                              = 3

---------------------------------------------------------
4. Cost Efficiency (10)
---------------------------------------------------------

Using:

TER / Expense Ratio

TER < 0.25%                       = 10
0.25-0.50%                        = 8
0.50-1.00%                        = 7
1.00-1.50%                        = 5
>1.50%                            = 3

---------------------------------------------------------
5. Scale & Track Record (10)
---------------------------------------------------------

AUM Score:

>10B THB                          = 10
5-10B THB                         = 8
1-5B THB                          = 6
<1B THB                           = 4

Track Record:

>10 years                         = 10
5-10 years                        = 8
3-5 years                         = 6
<3 years                          = 4

Final Factor:
(AUM + Track Record)/2

---------------------------------------------------------
6. Currency Management (10)
---------------------------------------------------------

Hedging Policy

100% Hedge                        = 10
75-99% Hedge                      = 8
50-74% Hedge                      = 6
<50% Hedge                        = 4
Unhedged                          = 3

---------------------------------------------------------

Fund Quality Score

Score =
F1+F2+F3+F4+F5+F6

Range:

0-<18    Weak
18-<30   Below Average
30-<42   Adequate
42-<52.3 Strong
52.3-60  Excellent

=========================================================
ALGORITHM B : ENTRY SCORE (MARKET TIMING)
=========================================================

Purpose:
- Determine attractiveness of adding capital TODAY.
- Dynamic.
- Recalculate daily or weekly.

Total Score: 100

---------------------------------------------------------
1. Drawdown Opportunity (40)
---------------------------------------------------------

Distance from All-Time High

ATH Drawdown

>30% below ATH                    = 40
20-30%                            = 32
10-20%                            = 24
5-10%                             = 16
Near ATH                          = 8

---------------------------------------------------------
2. Trend Health (30)
---------------------------------------------------------

Using:

50DMA
200DMA

Price > 50DMA > 200DMA           = 30
Price > 200DMA                   = 20
Price < 200DMA                   = 10

---------------------------------------------------------
3. Volatility / Fear Indicator (30)
---------------------------------------------------------

Examples:

VIX

25-35                             = 30
20-25                             = 24
15-20                             = 20
10-15                             = 12
<10                               = 6

Note:
Moderate fear often improves entry opportunities.

Entry Score

Score =
D + T + F

Range:

0-30   Poor Entry
31-50  Weak
51-70  Neutral
71-85  Attractive
86-100 Very Attractive

=========================================================
FINAL COMBINED DECISION
=========================================================

Decision Matrix:

Fund Quality >= 47.2/60
AND Entry >= 75
=> Strong Buy Candidate

Fund Quality >= 47.2/60
AND Entry 60-75
=> Normal DCA

Fund Quality >= 47.2/60
AND Entry < 60
=> Hold / Slow DCA

Fund Quality < 38.6/60
=> Avoid regardless of Entry Score

Fund Quality 38.6 to <47.2/60
=> No recommendation is defined

When Entry factors are missing, show the available subtotal and the possible
total range. Do not treat a partial score as a final Decision Matrix result.

Example:

K-USXNDQ-A(A)

Fund Quality Score = 50/60
Entry Score = 78/100

Result:
"Strong fund, attractive entry environment,
suitable for normal-to-aggressive DCA."

K-USXNDQ-A(A)

Fund Quality Score = 50/60
Entry Score = 42/100

Result:
"Strong fund, but current market conditions
offer limited margin of safety. Continue
regular DCA rather than increasing allocation."