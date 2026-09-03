import { useCallback, useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, Pressable, ScrollView, Modal, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL, type PayloadUser } from '../lib/auth';
import { usePullToRefresh } from '../lib/usePullToRefresh';

type Range = 'today' | '7d' | '30d' | 'all';

interface PaymentBreakdown {
  cash: number;
  mpesa: number;
  card: number;
  credit: number;
}
interface TopProduct {
  name: string;
  revenue: number;
  quantity: number;
}
interface ByStore {
  store: number;
  revenue: number;
  orderCount: number;
}
interface ByCategory {
  category: string;
  revenue: number;
  quantity: number;
}
interface ByCashier {
  cashier: number;
  name: string;
  revenue: number;
  orderCount: number;
}
interface Comparison {
  totalSales: number;
  orderCount: number;
  profitTotal: number | null;
}
interface SalesSummary {
  totalSales: number;
  discountGivenTotal: number;
  orderCount: number;
  averageOrderValue: number;
  profitTotal: number | null;
  paymentBreakdown: PaymentBreakdown;
  topProducts: TopProduct[];
  byStore: ByStore[];
  byCategory: ByCategory[];
  byCashier: ByCashier[];
  voidedCount: number;
  voidedTotal: number;
  refundedCount: number;
  refundedTotal: number;
  comparison: Comparison | null;
}
interface DailyPoint {
  date: string;
  totalSales: number;
  orderCount: number;
  voidedCount: number;
  refundedCount: number;
}

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

// Parsed from its own y/m/d components, never `new Date("YYYY-MM-DD")` -
// mirrors apps/web's own daily-trend-chart.tsx/day-detail-sheet.tsx comment:
// the latter parses as UTC midnight, which can print as the wrong day west
// of UTC.
function formatShortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatLongDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Text/Ionicons port of web's comparison-badge.tsx (no lucide-react in RN).
function ComparisonPill({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null) return null;
  if (previous === 0) {
    if (current === 0) return null;
    return (
      <View className="flex-row items-center gap-0.5">
        <Ionicons name="arrow-up" size={11} color="#10b981" />
        <Text className="text-xs font-medium text-emerald-600">new</Text>
      </View>
    );
  }
  const change = ((current - previous) / previous) * 100;
  const flat = Math.abs(change) < 0.5;
  const color = flat ? '#8a7a72' : change > 0 ? '#10b981' : '#ef4444';
  const icon: 'arrow-up' | 'arrow-down' | 'remove' = flat ? 'remove' : change > 0 ? 'arrow-up' : 'arrow-down';
  return (
    <View className="flex-row items-center gap-0.5">
      <Ionicons name={icon} size={11} color={color} />
      <Text style={{ color }} className="text-xs font-medium">
        {flat ? 'flat' : `${change > 0 ? '+' : ''}${change.toFixed(0)}%`}
      </Text>
    </View>
  );
}

function SummaryCard({ label, value, comparison }: { label: string; value: string; comparison?: { current: number; previous: number | null } }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="text-xl font-semibold text-foreground">{value}</Text>
        {comparison ? <ComparisonPill current={comparison.current} previous={comparison.previous} /> : null}
      </View>
    </View>
  );
}

function ProportionBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0;
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className="text-xs font-medium text-foreground">{value.toFixed(2)}</Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-muted">
        <View style={{ width: `${pct}%`, backgroundColor: color }} className="h-full rounded-full" />
      </View>
    </View>
  );
}

function ListRow({ left, mid, right }: { left: string; mid?: string; right: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-border/50 py-2">
      <Text className="flex-1 pr-2 text-sm text-foreground" numberOfLines={1}>
        {left}
      </Text>
      {mid ? <Text className="w-14 text-right text-sm text-muted-foreground">{mid}</Text> : null}
      <Text className="w-20 text-right text-sm font-medium text-foreground">{right}</Text>
    </View>
  );
}

function EmptySection({ text }: { text: string }) {
  return <Text className="py-2 text-center text-sm text-muted-foreground">{text}</Text>;
}

// Mirrors apps/web/src/app/dashboard/reports/page.tsx against the exact
// same two Payload REST endpoints it already calls - no backend changes.
// Both endpoints already role-gate their own response (profitTotal/
// byCashier populated only for owner/manager), so this just renders
// whatever comes back rather than re-checking the role itself. Deliberately
// tenant-wide (no store filter, unlike the rest of this app's screens which
// are always scoped to the active branch) - Reports is the one place an
// owner/manager overseeing multiple stores wants the whole business, not
// just whichever branch this particular till happens to be on right now;
// this matches web's Reports page's own default (no branch filter applied)
// rather than every other mobile screen's till-scoped default.
export function ReportsScreen({ user, payloadToken }: { user: PayloadUser; payloadToken: string }) {
  const [range, setRange] = useState<Range>('today');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<SalesSummary | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  const trendRange = range === '7d' ? '7d' : '30d';
  const canSeeProfit = user.role === 'owner';

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/reports/sales-summary?range=${range}`, { headers: { Authorization: `JWT ${payloadToken}` } }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/reports/sales-daily?range=${trendRange}`, { headers: { Authorization: `JWT ${payloadToken}` } }).then((r) => r.json()),
    ])
      .then(([summaryBody, dailyBody]) => {
        setSummary(summaryBody);
        setDaily(dailyBody?.days ?? []);
      })
      .finally(() => setLoading(false));
  }, [range, trendRange, payloadToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  // Fetched on demand (not pre-loaded for every day in the range) - mirrors
  // web's day-detail-sheet.tsx's identical reasoning.
  useEffect(() => {
    if (!selectedDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDayDetail(null);
      return;
    }
    setDayLoading(true);
    fetch(`${API_BASE_URL}/api/reports/sales-summary?date=${selectedDate}`, { headers: { Authorization: `JWT ${payloadToken}` } })
      .then((r) => r.json())
      .then(setDayDetail)
      .finally(() => setDayLoading(false));
  }, [selectedDate, payloadToken]);

  const hasLosses = summary ? summary.voidedCount + summary.refundedCount > 0 : false;
  const maxDaily = Math.max(1, ...daily.map((d) => d.totalSales));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-4 p-4" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#df5102" />}>
        <Text className="text-2xl font-semibold text-foreground">Reports</Text>

        <View className="flex-row gap-1.5">
          {RANGES.map((r) => (
            <Pressable
              key={r.value}
              android_ripple={{ color: '#ffffff40' }}
              className={`flex-1 items-center rounded-md border py-2 ${range === r.value ? 'border-primary bg-primary' : 'border-border'}`}
              onPress={() => setRange(r.value)}
            >
              <Text className={range === r.value ? 'text-xs font-medium text-primary-foreground' : 'text-xs text-foreground'}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {!summary || loading ? (
          <Text className="mt-8 text-center text-muted-foreground">Loading...</Text>
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(200)} className="flex-row flex-wrap gap-3">
              <SummaryCard label="Total sales" value={summary.totalSales.toFixed(2)} comparison={{ current: summary.totalSales, previous: summary.comparison?.totalSales ?? null }} />
              <SummaryCard label="Orders" value={String(summary.orderCount)} comparison={{ current: summary.orderCount, previous: summary.comparison?.orderCount ?? null }} />
              <SummaryCard label="Average order" value={summary.averageOrderValue.toFixed(2)} />
              {canSeeProfit ? (
                <SummaryCard
                  label="Profit"
                  value={(summary.profitTotal ?? 0).toFixed(2)}
                  comparison={{ current: summary.profitTotal ?? 0, previous: summary.comparison?.profitTotal ?? null }}
                />
              ) : null}
            </Animated.View>

            {summary.discountGivenTotal > 0 || hasLosses ? (
              <View className="flex-row flex-wrap gap-3">
                {summary.discountGivenTotal > 0 ? <SummaryCard label="Discounts given" value={summary.discountGivenTotal.toFixed(2)} /> : null}
                {summary.voidedCount > 0 ? <SummaryCard label="Voided" value={`${summary.voidedCount} (${summary.voidedTotal.toFixed(2)})`} /> : null}
                {summary.refundedCount > 0 ? <SummaryCard label="Refunded" value={`${summary.refundedCount} (${summary.refundedTotal.toFixed(2)})`} /> : null}
              </View>
            ) : null}

            <View className="gap-2 rounded-lg border border-border bg-card p-3">
              <Text className="text-sm font-medium text-foreground">Daily trend</Text>
              <Text className="text-xs text-muted-foreground">{trendRange === '7d' ? 'Last 7 days' : 'Last 30 days'} - tap a bar for that day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="flex-row items-end gap-1.5 py-2">
                {daily.map((d) => (
                  <Pressable key={d.date} onPress={() => setSelectedDate(d.date)} className="items-center gap-1">
                    <View className="h-24 w-6 justify-end overflow-hidden rounded bg-muted">
                      <View style={{ height: `${Math.max(d.totalSales > 0 ? 4 : 0, (d.totalSales / maxDaily) * 100)}%` }} className="w-full rounded bg-primary" />
                    </View>
                    <Text className="text-[10px] text-muted-foreground">{formatShortDate(d.date).split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View className="gap-2 rounded-lg border border-border bg-card p-3">
              <Text className="text-sm font-medium text-foreground">Payment breakdown</Text>
              <ProportionBar label="Cash" value={summary.paymentBreakdown.cash} max={Math.max(1, summary.paymentBreakdown.cash, summary.paymentBreakdown.mpesa, summary.paymentBreakdown.credit)} color="#df5102" />
              <ProportionBar label="M-Pesa" value={summary.paymentBreakdown.mpesa} max={Math.max(1, summary.paymentBreakdown.cash, summary.paymentBreakdown.mpesa, summary.paymentBreakdown.credit)} color="#10b981" />
              <ProportionBar label="Credit" value={summary.paymentBreakdown.credit} max={Math.max(1, summary.paymentBreakdown.cash, summary.paymentBreakdown.mpesa, summary.paymentBreakdown.credit)} color="#6366f1" />
            </View>

            <View className="gap-1 rounded-lg border border-border bg-card p-3">
              <Text className="mb-1 text-sm font-medium text-foreground">Top products</Text>
              {summary.topProducts.length === 0 ? (
                <EmptySection text="No completed sales in this period" />
              ) : (
                summary.topProducts.map((p) => <ListRow key={p.name} left={p.name} mid={String(p.quantity)} right={p.revenue.toFixed(2)} />)
              )}
            </View>

            <View className="gap-1 rounded-lg border border-border bg-card p-3">
              <Text className="mb-1 text-sm font-medium text-foreground">By category</Text>
              {summary.byCategory.length === 0 ? (
                <EmptySection text="No completed sales in this period" />
              ) : (
                summary.byCategory.map((c) => <ListRow key={c.category} left={c.category} mid={String(c.quantity)} right={c.revenue.toFixed(2)} />)
              )}
            </View>

            {summary.byStore.length > 1 ? (
              <View className="gap-1 rounded-lg border border-border bg-card p-3">
                <Text className="mb-1 text-sm font-medium text-foreground">By store</Text>
                {summary.byStore.map((s) => (
                  <ListRow key={s.store} left={`Store #${s.store}`} mid={String(s.orderCount)} right={s.revenue.toFixed(2)} />
                ))}
              </View>
            ) : null}

            {summary.byCashier.length > 0 ? (
              <View className="gap-1 rounded-lg border border-border bg-card p-3">
                <Text className="mb-1 text-sm font-medium text-foreground">By cashier</Text>
                {summary.byCashier.map((c) => (
                  <ListRow key={c.cashier} left={c.name} mid={String(c.orderCount)} right={c.revenue.toFixed(2)} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={selectedDate != null} animationType="slide" transparent onRequestClose={() => setSelectedDate(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <SafeAreaView edges={['bottom']} className="max-h-[80%] rounded-t-2xl bg-background">
            <View className="flex-row items-center justify-between border-b border-border p-4">
              <Text className="text-base font-semibold text-foreground">{selectedDate ? formatLongDate(selectedDate) : ''}</Text>
              <Pressable android_ripple={{}} onPress={() => setSelectedDate(null)}>
                <Text className="text-muted-foreground">Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="gap-3 p-4">
              {dayLoading || !dayDetail ? (
                <Text className="py-8 text-center text-muted-foreground">Loading...</Text>
              ) : (
                <>
                  <View className="flex-row flex-wrap gap-3">
                    <SummaryCard
                      label="Total sales"
                      value={dayDetail.totalSales.toFixed(2)}
                      comparison={{ current: dayDetail.totalSales, previous: dayDetail.comparison?.totalSales ?? null }}
                    />
                    <SummaryCard
                      label="Orders"
                      value={String(dayDetail.orderCount)}
                      comparison={{ current: dayDetail.orderCount, previous: dayDetail.comparison?.orderCount ?? null }}
                    />
                    {canSeeProfit ? (
                      <SummaryCard
                        label="Profit"
                        value={(dayDetail.profitTotal ?? 0).toFixed(2)}
                        comparison={{ current: dayDetail.profitTotal ?? 0, previous: dayDetail.comparison?.profitTotal ?? null }}
                      />
                    ) : null}
                  </View>
                  <View className="gap-2 rounded-lg border border-border bg-card p-3">
                    <Text className="text-sm font-medium text-foreground">Payment breakdown</Text>
                    <ProportionBar
                      label="Cash"
                      value={dayDetail.paymentBreakdown.cash}
                      max={Math.max(1, dayDetail.paymentBreakdown.cash, dayDetail.paymentBreakdown.mpesa, dayDetail.paymentBreakdown.credit)}
                      color="#df5102"
                    />
                    <ProportionBar
                      label="M-Pesa"
                      value={dayDetail.paymentBreakdown.mpesa}
                      max={Math.max(1, dayDetail.paymentBreakdown.cash, dayDetail.paymentBreakdown.mpesa, dayDetail.paymentBreakdown.credit)}
                      color="#10b981"
                    />
                    <ProportionBar
                      label="Credit"
                      value={dayDetail.paymentBreakdown.credit}
                      max={Math.max(1, dayDetail.paymentBreakdown.cash, dayDetail.paymentBreakdown.mpesa, dayDetail.paymentBreakdown.credit)}
                      color="#6366f1"
                    />
                  </View>
                  <View className="gap-1 rounded-lg border border-border bg-card p-3">
                    <Text className="mb-1 text-sm font-medium text-foreground">Top products</Text>
                    {dayDetail.topProducts.length === 0 ? (
                      <EmptySection text="No completed sales this day" />
                    ) : (
                      dayDetail.topProducts.map((p) => <ListRow key={p.name} left={p.name} mid={String(p.quantity)} right={p.revenue.toFixed(2)} />)
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
