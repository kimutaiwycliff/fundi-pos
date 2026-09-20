import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// Port of apps/mobile/src/sales/invoiceHtml.ts's design (not its code) to
// @react-pdf/renderer, which has no HTML/CSS engine - each section is
// rebuilt from View/Text primitives instead. No HTML-escaping needed here:
// <Text> never interprets its children as markup.
export interface ReceiptTenantInfo {
  name: string;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
}

export interface ReceiptLineData {
  label: string;
  quantity: number;
  lineTotal: number;
}

export interface ReceiptOrderData {
  orderId: string;
  createdAtLabel: string;
  cashierLabel: string;
  customerLabel: string | null;
  terminalLabel: string | null;
  lines: ReceiptLineData[];
  taxTotal: number;
  discountTotal: number;
  total: number;
  tenderType: string;
  isUnpaidCredit: boolean;
}

const TENDER_LABEL: Record<string, string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  credit: 'Credit (pay later)',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: '18mm',
    paddingBottom: '18mm',
    paddingHorizontal: '16mm',
    fontSize: 10.5,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  letterhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 3,
    borderBottomColor: '#df5102',
    paddingBottom: 14,
    marginBottom: 24,
  },
  businessName: { fontSize: 18, fontWeight: 'bold', color: '#16100e' },
  businessMeta: { marginTop: 4, fontSize: 9, color: '#555' },
  invoiceTitleWrap: { alignItems: 'flex-end' },
  invoiceTitle: { fontSize: 20, letterSpacing: 2, color: '#df5102', fontWeight: 'bold' },
  invoiceMetaRow: { flexDirection: 'row', marginTop: 4, fontSize: 9, color: '#555' },
  invoiceMetaLabel: { color: '#888', width: 60, textAlign: 'right', marginRight: 4 },
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  partyEnd: { alignItems: 'flex-end' },
  partyHeading: {
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  partyName: { fontSize: 11, fontWeight: 'bold', color: '#16100e' },
  partyLine: { fontSize: 9.5, color: '#444', marginTop: 2 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#ddd', paddingBottom: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#eee' },
  tableRowAlt: { backgroundColor: '#faf8f7' },
  th: { fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase', color: '#888', fontWeight: 'bold' },
  td: { fontSize: 9.5 },
  colItem: { flex: 3 },
  colQty: { flex: 1, textAlign: 'right' },
  colUnit: { flex: 1.2, textAlign: 'right' },
  colAmount: { flex: 1.2, textAlign: 'right' },
  banner: {
    marginTop: 18,
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: '#b45309',
    backgroundColor: '#fff8ec',
    color: '#b45309',
    padding: 10,
    borderRadius: 6,
    fontWeight: 'bold',
    fontSize: 9.5,
  },
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  totals: { width: 220 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, fontSize: 9.5, color: '#444' },
  totalsGrand: {
    borderTopWidth: 2,
    borderTopColor: '#16100e',
    marginTop: 6,
    paddingTop: 8,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#16100e',
  },
  footer: { marginTop: 36, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#eee', fontSize: 9, color: '#777' },
});

export function InvoiceDocument({ data, tenant }: { data: ReceiptOrderData; tenant: ReceiptTenantInfo }) {
  const invoiceNumber = data.orderId.slice(0, 8).toUpperCase();
  const subtotal = data.total - data.taxTotal + data.discountTotal;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          <View>
            <Text style={styles.businessName}>{tenant.name}</Text>
            {tenant.receiptHeader ? <Text style={styles.businessMeta}>{tenant.receiptHeader}</Text> : null}
          </View>
          <View style={styles.invoiceTitleWrap}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>Invoice #</Text>
              <Text>{invoiceNumber}</Text>
            </View>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>Date</Text>
              <Text>{data.createdAtLabel}</Text>
            </View>
            {data.terminalLabel ? (
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Terminal</Text>
                <Text>{data.terminalLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.parties}>
          <View>
            <Text style={styles.partyHeading}>Billed to</Text>
            <Text style={styles.partyName}>{data.customerLabel ?? 'Walk-in customer'}</Text>
          </View>
          <View style={styles.partyEnd}>
            <Text style={styles.partyHeading}>Served by</Text>
            <Text style={styles.partyLine}>{data.cashierLabel}</Text>
          </View>
        </View>

        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colItem]}>Item</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit price</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={i % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}>
              <Text style={[styles.td, styles.colItem]}>{line.label}</Text>
              <Text style={[styles.td, styles.colQty]}>{line.quantity}</Text>
              <Text style={[styles.td, styles.colUnit]}>{(line.lineTotal / line.quantity).toFixed(2)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{line.lineTotal.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {data.isUnpaidCredit ? (
          <Text style={styles.banner}>This invoice is UNPAID — please settle on the agreed date.</Text>
        ) : null}

        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <View style={styles.totalsRow}>
              <Text>Subtotal</Text>
              <Text>{subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>Tax</Text>
              <Text>{data.taxTotal.toFixed(2)}</Text>
            </View>
            {data.discountTotal > 0 ? (
              <View style={styles.totalsRow}>
                <Text>Discount</Text>
                <Text>-{data.discountTotal.toFixed(2)}</Text>
              </View>
            ) : null}
            <View style={styles.totalsRow}>
              <Text>Payment method</Text>
              <Text>{TENDER_LABEL[data.tenderType] ?? data.tenderType}</Text>
            </View>
            <View style={[styles.totalsRow, styles.totalsGrand]}>
              <Text>Total due</Text>
              <Text>{data.total.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {tenant.receiptFooter ? <Text style={styles.footer}>{tenant.receiptFooter}</Text> : null}
      </Page>
    </Document>
  );
}
