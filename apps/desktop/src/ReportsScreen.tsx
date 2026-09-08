import { useCallback, useEffect, useState } from 'react';
import type { PayloadUser } from './auth';
import { fetchSalesDaily, fetchSalesSummary, fetchStockValue, type DailyPoint, type Range, type SalesSummary, type StockValue } from './reports';

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value">{value}</span>
    </div>
  );
}

// Same two Payload REST endpoints apps/mobile/src/admin/ReportsScreen.tsx
// already calls, plus the new stock-value card - deliberately tenant-wide
// (no store filter), matching that screen's own reasoning: Reports is the
// one place an owner/manager overseeing multiple stores wants the whole
// business, not just whichever branch this till happens to be on.
export function Reports({ user, payloadToken }: { user: PayloadUser; payloadToken: string }) {
  const canSeeProfit = user.role === 'owner';
  const [range, setRange] = useState<Range>('today');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [stockValue, setStockValue] = useState<StockValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const trendRange: '7d' | '30d' = range === '7d' ? '7d' : '30d';

  const refresh = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchSalesSummary(payloadToken, range), fetchSalesDaily(payloadToken, trendRange), fetchStockValue(payloadToken)])
      .then(([s, d, sv]) => {
        setSummary(s);
        setDaily(d);
        setStockValue(sv);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [payloadToken, range, trendRange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasLosses = summary ? summary.voidedCount + summary.refundedCount > 0 : false;
  const maxDaily = Math.max(1, ...daily.map((d) => d.totalSales));

  return (
    <div className="section-shell">
      <div className="section-toolbar">
        <div className="segmented" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.value} type="button" role="tab" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!summary || loading ? (
        <p className="pane-empty-state-hint">{!summary && loadError ? loadError : 'Loading...'}</p>
      ) : (
        <div className="section-body">
          <div className="stat-grid">
            <StatCard label="Total sales" value={summary.totalSales.toFixed(2)} />
            <StatCard label="Orders" value={String(summary.orderCount)} />
            <StatCard label="Average order" value={summary.averageOrderValue.toFixed(2)} />
            {canSeeProfit ? <StatCard label="Profit" value={(summary.profitTotal ?? 0).toFixed(2)} /> : null}
          </div>

          {stockValue ? (
            <div className="section-card">
              <h3>Stock on hand right now</h3>
              <p className="section-card-hint">Not the same as the sales figures above - this is what&apos;s currently on the shelf</p>
              <div className="stat-grid">
                {canSeeProfit ? <StatCard label="Stock value (at cost)" value={(stockValue.stockValue ?? 0).toFixed(2)} /> : null}
                <StatCard label="Potential revenue" value={stockValue.potentialRevenue.toFixed(2)} />
                {canSeeProfit ? <StatCard label="Potential profit" value={(stockValue.potentialProfit ?? 0).toFixed(2)} /> : null}
              </div>
            </div>
          ) : null}

          {summary.discountGivenTotal > 0 || hasLosses ? (
            <div className="stat-grid">
              {summary.discountGivenTotal > 0 ? <StatCard label="Discounts given" value={summary.discountGivenTotal.toFixed(2)} /> : null}
              {summary.voidedCount > 0 ? <StatCard label="Voided" value={`${summary.voidedCount} (${summary.voidedTotal.toFixed(2)})`} /> : null}
              {summary.refundedCount > 0 ? <StatCard label="Refunded" value={`${summary.refundedCount} (${summary.refundedTotal.toFixed(2)})`} /> : null}
            </div>
          ) : null}

          <div className="section-card">
            <h3>Daily trend</h3>
            <p className="section-card-hint">{trendRange === '7d' ? 'Last 7 days' : 'Last 30 days'}</p>
            <div className="trend-chart">
              {daily.map((d) => (
                <div key={d.date} className="trend-bar-wrap" title={`${d.date}: ${d.totalSales.toFixed(2)}`}>
                  <div className="trend-bar" style={{ height: `${Math.max(d.totalSales > 0 ? 4 : 0, (d.totalSales / maxDaily) * 100)}%` }} />
                  <span className="trend-bar-label">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="section-card">
            <h3>Top products</h3>
            {summary.topProducts.length === 0 ? (
              <p className="section-card-hint">No completed sales in this period</p>
            ) : (
              <table className="data-table">
                <tbody>
                  {summary.topProducts.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{p.quantity}</td>
                      <td className="num">{p.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="section-card">
            <h3>By category</h3>
            {summary.byCategory.length === 0 ? (
              <p className="section-card-hint">No completed sales in this period</p>
            ) : (
              <table className="data-table">
                <tbody>
                  {summary.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="num">{c.quantity}</td>
                      <td className="num">{c.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {summary.byCashier.length > 0 ? (
            <div className="section-card">
              <h3>By cashier</h3>
              <table className="data-table">
                <tbody>
                  {summary.byCashier.map((c) => (
                    <tr key={c.cashier}>
                      <td>{c.name}</td>
                      <td className="num">{c.orderCount}</td>
                      <td className="num">{c.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
