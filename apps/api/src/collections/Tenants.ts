import type { CollectionConfig, FieldAccess } from 'payload';
import { APIError } from 'payload';
import {
  ADDON_LABELS,
  ADDONS,
  BILLING_CYCLES,
  normalizeKenyanPhone,
  normalizeShopSlug,
  parseCutoff,
  TRIAL_DAYS,
  type Addon,
} from '@hardware-pos/business-logic';
import { toID } from '../lib/relations.ts';

const platformAdminOnly: FieldAccess = ({ req }) => req.user?.collection === 'platform-admins';

function sameAddons(a: unknown, b: unknown): boolean {
  const left = [...((a as string[] | null) ?? [])].sort().join(',');
  const right = [...((b as string[] | null) ?? [])].sort().join(',');
  return left === right;
}

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'name' },
  access: {
    // A tenant user may only ever read/update their own tenant record,
    // scoped by `id` - Tenants has no `tenant` relationship field (a
    // tenant doesn't belong to itself), so the shared ownerOnly helper
    // (which filters by `{ tenant: { equals: ... } }`, correct for every
    // OTHER collection) doesn't apply here. update reused it anyway until
    // now, which silently 500'd on the very first real PATCH ever issued
    // against this collection ("Cannot find field for path at tenant" -
    // Postgres/Drizzle rejecting a WHERE clause on a column that doesn't
    // exist) - caught live wiring up the dashboard's Settings page, the
    // first thing in this whole project to ever call it.
    read: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user) return false;
      return { id: { equals: toID(req.user.tenant) } };
    },
    update: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user || req.user.role !== 'owner') return false;
      return { id: { equals: toID(req.user.tenant) } };
    },
    // Self-serve signup (apps/web's /signup) creates tenants via
    // overrideAccess: true, bypassing this entirely - this specifically
    // governs the OTHER path, a platform admin manually onboarding a
    // client through /admin (e.g. someone who paid before ever visiting
    // the signup page). Still blocked for tenant users themselves; a
    // tenant can never create another tenant.
    create: ({ req }) => req.user?.collection === 'platform-admins',
    delete: () => false,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      // Platform-admin-controlled suspend/soft-delete - distinct from
      // billingStatus below (which reflects the *subscription's* state,
      // e.g. payment failures). 'suspended'/'deleted' both lock out every
      // login path for this tenant (see lib/billing.ts's checkTenantAccess,
      // the same shared choke point billingStatus === 'canceled' already
      // used) without touching any other collection's rows - "deleted"
      // here is always reversible (Restore sets this back to 'active'),
      // never a real data purge.
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'suspended', 'deleted'],
      access: { update: ({ req }) => req.user?.collection === 'platform-admins' },
      admin: { description: 'Suspended/deleted tenants (and all their staff) are locked out of every login path - web and till PIN.' },
    },
    { name: 'statusChangedAt', type: 'date', admin: { readOnly: true } },
    { name: 'statusReason', type: 'text', admin: { description: 'Optional note - shown in the platform audit log, not to the tenant.' } },
    {
      name: 'subscriptionTier',
      type: 'select',
      required: true,
      defaultValue: 'trial',
      options: ['trial', 'starter', 'growth', 'enterprise'],
      // Previously writable by a tenant's own owner (Tenants.update allows
      // it) even though no UI ever exposed that - now that the platform
      // panel is the intended single source of truth for this, closing it.
      access: { update: ({ req }) => req.user?.collection === 'platform-admins' },
    },
    {
      name: 'billingStatus',
      type: 'select',
      required: true,
      defaultValue: 'trialing',
      options: ['active', 'trialing', 'past_due', 'canceled'],
      access: { update: ({ req }) => req.user?.collection === 'platform-admins' },
    },
    {
      // Paid add-ons (e.g. Sell Online), switched on/off per tenant by a
      // platform admin at will - independent of subscriptionTier. Every
      // add-on feature checks this via @hardware-pos/business-logic's
      // hasAddon(), server-side and in each client. Turning one off never
      // deletes the data it created; its screens just lock again.
      name: 'addons',
      type: 'select',
      hasMany: true,
      options: ADDONS.map((value) => ({ value, label: ADDON_LABELS[value] })),
      access: { update: ({ req }) => req.user?.collection === 'platform-admins' },
    },
    { name: 'addonsChangedAt', type: 'date', admin: { readOnly: true } },
    // Platform billing (the SaaS operator tracking what each tenant pays) -
    // platform-admin-only to change. paidUntil is maintained by
    // SubscriptionPayments (recording a payment extends it); the /platform
    // UI turns these into paid / due soon / overdue via business-logic's
    // subscriptionState().
    {
      name: 'billingCycle',
      type: 'select',
      defaultValue: 'monthly',
      options: [...BILLING_CYCLES],
      access: { update: platformAdminOnly },
    },
    {
      name: 'planPrice',
      type: 'number',
      min: 0,
      access: { update: platformAdminOnly },
      admin: { description: 'KES per billing cycle (negotiated price). Empty = list price for the tier.' },
    },
    { name: 'paidUntil', type: 'date', access: { update: platformAdminOnly } },
    { name: 'trialEndsAt', type: 'date', access: { update: platformAdminOnly } },
    { name: 'billingContactName', type: 'text', access: { update: platformAdminOnly } },
    { name: 'billingContactPhone', type: 'text', access: { update: platformAdminOnly } },
    { name: 'billingContactEmail', type: 'email', access: { update: platformAdminOnly } },
    {
      // Internal only - never shown to (or readable by) the tenant.
      name: 'platformNotes',
      type: 'textarea',
      access: { read: platformAdminOnly, update: platformAdminOnly },
    },
    {
      // Printed on every receipt, above the line items - typically a
      // physical address/phone/KRA PIN, since `name` alone is already the
      // header's title line. Synced to the till (docker/powersync/
      // sync-config.yaml) so printing works fully offline once it's synced
      // down once.
      name: 'receiptHeader',
      type: 'textarea',
      admin: { description: 'Printed at the top of every receipt, below the business name (e.g. address, phone).' },
    },
    {
      name: 'receiptFooter',
      type: 'textarea',
      admin: { description: 'Printed at the bottom of every receipt (e.g. "Thank you for your business!", return policy).' },
    },
    {
      // Shift-gating itself (blocking Sell/checkout without an open shift)
      // is purely client-side UX, duplicated identically across web/
      // mobile/desktop - this is the one server-held source of truth all
      // three read to decide whether to enforce it. Defaults true so every
      // existing tenant keeps today's behavior unchanged until an owner
      // explicitly opts out.
      name: 'shiftsRequired',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Require staff to open a shift before they can complete a sale. Owners can always turn this off for their whole business.' },
    },
    {
      // Same shape/reasoning as shiftsRequired above. Owners are never
      // bound by each product's maxDiscountAmount cap regardless of this
      // toggle (they already exclusively configure it and see cost
      // price) - this setting only controls whether managers/cashiers
      // are. Defaults true so every existing tenant keeps today's
      // behavior unchanged. The floor of never selling below cost is
      // unconditional and NOT governed by this toggle - see Orders.ts's
      // beforeChange hook.
      name: 'enforceDiscountCaps',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          "Limit staff (not owners) to each product's Max discount amount at the till. Turn off to let staff discount freely - a sale can still never go below a product's cost.",
      },
    },
    // Marketing details printed under every receipt (see business-logic's
    // receiptFooterWithMarketing) and used by the public storefront's
    // "Order on WhatsApp" buttons. Available on every plan.
    { name: 'whatsappNumber', type: 'text', admin: { description: 'Shop WhatsApp number customers order on, e.g. 0712345678.' } },
    { name: 'socialHandles', type: 'text', admin: { description: 'e.g. "IG/TikTok @babyshop.ke" - printed on receipts.' } },
    { name: 'googleReviewUrl', type: 'text', admin: { description: 'Your Google review link - printed on receipts.' } },
    {
      // KES each loyalty point is worth when redeemed at checkout (points
      // are earned at 1 per KES 100 - Orders.ts). Default 1 = 1% back.
      name: 'loyaltyPointValue',
      type: 'number',
      defaultValue: 1,
      min: 0,
      admin: { step: 0.01, description: 'KES value of one loyalty point when a customer redeems it. 0 turns redemption off.' },
    },
    // Public storefront (Sell Online add-on) - served at /shop/<shopSlug>
    // by apps/web via the public /api/storefront/<slug> route, only while
    // the add-on is on AND the owner has it enabled.
    { name: 'shopSlug', type: 'text', unique: true, index: true, admin: { description: 'Your online shop address: /shop/<this>.' } },
    { name: 'storefrontEnabled', type: 'checkbox', defaultValue: false },
    {
      // On: every active product is listed unless hidden per product
      // (Products.hideOnline). Off (default): only hand-picked products
      // (Products.showOnline). See business-logic's isListedOnline().
      name: 'storefrontListAll',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'List all active products online; hide individual ones per product.' },
    },
    { name: 'storefrontTagline', type: 'text' },
    // Storefront SEO (Settings -> Online shop -> Search engines). Every one
    // is optional with a sensible fallback in apps/web's /shop pages, so a
    // shop that never touches these still gets decent titles/descriptions.
    { name: 'seoTitle', type: 'text', admin: { description: 'Google result title for the shop page (~60 characters).' } },
    { name: 'seoDescription', type: 'textarea', admin: { description: 'Google result snippet (~155 characters).' } },
    { name: 'seoImage', type: 'upload', relationTo: 'media', admin: { description: 'Image shown when the shop link is shared.' } },
    { name: 'storefrontCity', type: 'text', admin: { description: 'Town / area, e.g. "Westlands, Nairobi" - helps local search.' } },
    { name: 'storefrontIndexable', type: 'checkbox', defaultValue: true, admin: { description: 'Allow Google to list the shop.' } },
    {
      // The content="..." value of Google Search Console's HTML-tag
      // verification, rendered on /shop/<slug> so the owner can verify a
      // URL-prefix property for just their shop and submit its sitemap.
      name: 'googleSiteVerification',
      type: 'text',
      admin: { description: 'Google Search Console HTML-tag verification code.' },
    },
    // Storefront delivery & payment (Settings -> Online shop). Shown to
    // shoppers before they open WhatsApp - unexpected delivery costs are the
    // top fixable reason people abandon an order. Nothing is shown unless
    // the owner fills it in, so the shop never promises what it doesn't do.
    {
      name: 'deliveryZones',
      type: 'array',
      maxRows: 20,
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'fee', type: 'number', required: true, min: 0 },
        { name: 'eta', type: 'text' },
      ],
    },
    { name: 'freeDeliveryThreshold', type: 'number', min: 0, admin: { description: 'Free delivery when the bag reaches this many KES. Empty = no free delivery.' } },
    { name: 'payOnDelivery', type: 'checkbox', defaultValue: false, admin: { description: 'Show "Pay on delivery" on the shop.' } },
    { name: 'sameDayCutoff', type: 'text', admin: { description: 'Same-day delivery order cutoff, 24h "HH:MM" Nairobi time (e.g. 16:00).' } },
    { name: 'sameDayArea', type: 'text', admin: { description: 'Where same-day delivery applies, e.g. "Nairobi".' } },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        // Every new tenant starts a 14-day trial clock (signup or admin-created).
        if (operation === 'create' && !data.trialEndsAt) {
          data.trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
        }
        if (operation === 'update' && data.status && originalDoc && data.status !== originalDoc.status) {
          data.statusChangedAt = new Date().toISOString();
        }
        if (operation === 'update' && Array.isArray(data.addons) && originalDoc && !sameAddons(data.addons, originalDoc.addons)) {
          data.addonsChangedAt = new Date().toISOString();
        }
        if (typeof data.shopSlug === 'string' || data.shopSlug === null) {
          if (!data.shopSlug) {
            data.shopSlug = null;
          } else {
            const slug = normalizeShopSlug(data.shopSlug);
            if (!slug) throw new APIError('Shop address must be 3-40 letters, numbers or hyphens.', 400);
            data.shopSlug = slug;
          }
        }
        if (typeof data.googleSiteVerification === 'string') {
          // Owners usually paste Google's whole <meta ... content="XYZ" /> tag.
          const raw = data.googleSiteVerification.trim();
          const fromTag = raw.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
          const code = (fromTag ?? raw).trim();
          if (code && !/^[A-Za-z0-9_-]{10,100}$/.test(code)) {
            throw new APIError('That Google verification code doesn\'t look right - paste the code (or the whole meta tag) from Search Console.', 400);
          }
          data.googleSiteVerification = code || null;
        }
        if (typeof data.sameDayCutoff === 'string') {
          const cutoff = data.sameDayCutoff.trim();
          if (cutoff && parseCutoff(cutoff) == null) {
            throw new APIError('Same-day cutoff must be a time like 16:00.', 400);
          }
          data.sameDayCutoff = cutoff || null;
        }
        if (typeof data.whatsappNumber === 'string' && data.whatsappNumber.trim()) {
          const phone = normalizeKenyanPhone(data.whatsappNumber);
          if (!phone) throw new APIError('Enter a valid Kenyan WhatsApp number, e.g. 0712345678.', 400);
          data.whatsappNumber = phone;
        }
        return data;
      },
    ],
    afterChange: [
      // Only a platform admin can actually change these fields (see the
      // field-level access above), so this only ever fires for genuine
      // platform actions - never for a tenant owner's own Settings edits.
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== 'update' || !previousDoc || req.user?.collection !== 'platform-admins') return doc;
        // SubscriptionPayments' paidUntil bookkeeping logs its own entry.
        if (req.context?.skipPlatformAudit) return doc;

        const statusChanged = doc.status !== previousDoc.status;
        const subscriptionChanged = doc.subscriptionTier !== previousDoc.subscriptionTier || doc.billingStatus !== previousDoc.billingStatus;
        const addonsChanged = !sameAddons(doc.addons, previousDoc.addons);
        if (addonsChanged) {
          const before = new Set<string>(previousDoc.addons ?? []);
          const after = new Set<string>(doc.addons ?? []);
          const enabled = [...after].filter((a) => !before.has(a));
          const disabled = [...before].filter((a) => !after.has(a));
          const describe = (list: string[]) => list.map((a) => ADDON_LABELS[a as Addon] ?? a).join(', ');
          const parts = [enabled.length ? `enabled ${describe(enabled)}` : null, disabled.length ? `disabled ${describe(disabled)}` : null];
          await req.payload.create({
            collection: 'platform-audit-log',
            overrideAccess: true,
            data: {
              tenant: Number(doc.id),
              actor: Number(req.user.id),
              action: 'addon_changed',
              summary: `${doc.name}: ${parts.filter(Boolean).join('; ')}`,
              metadata: { enabled, disabled },
            },
            req,
          });
        }
        // Billing details edited by hand on /platform (price, cycle, dates,
        // contact, notes) - field names only, never the notes' content.
        const BILLING_FIELDS: Record<string, string> = {
          planPrice: 'price',
          billingCycle: 'billing cycle',
          trialEndsAt: 'trial end',
          paidUntil: 'paid until',
          billingContactName: 'billing contact name',
          billingContactPhone: 'billing contact phone',
          billingContactEmail: 'billing contact email',
          platformNotes: 'internal notes',
        };
        const changedBilling = Object.keys(BILLING_FIELDS).filter((key) => (doc[key] ?? null) !== (previousDoc[key] ?? null));
        if (changedBilling.length > 0) {
          await req.payload.create({
            collection: 'platform-audit-log',
            overrideAccess: true,
            data: {
              tenant: Number(doc.id),
              actor: Number(req.user.id),
              action: 'billing_updated',
              summary: `${doc.name}: updated ${changedBilling.map((k) => BILLING_FIELDS[k]).join(', ')}`,
              metadata: Object.fromEntries(
                changedBilling
                  .filter((k) => k !== 'platformNotes')
                  .map((k) => [k, { from: previousDoc[k] ?? null, to: doc[k] ?? null }]),
              ),
            },
            req,
          });
        }
        if (!statusChanged && !subscriptionChanged) return doc;

        let action: 'tenant_suspended' | 'tenant_reactivated' | 'tenant_soft_deleted' | 'tenant_restored' | 'subscription_changed';
        let summary: string;
        let metadata: Record<string, unknown>;
        if (statusChanged) {
          if (doc.status === 'suspended') {
            action = 'tenant_suspended';
            summary = `${doc.name} suspended`;
          } else if (doc.status === 'deleted') {
            action = 'tenant_soft_deleted';
            summary = `${doc.name} soft-deleted`;
            // Staff already can't log in once their tenant is deleted
            // (checkTenantAccess blocks every path) - losing their
            // phone-login identifier at the same moment costs nothing and
            // immediately frees the number for a different tenant's staff
            // to register, since Users.phone is a DB-wide unique index.
            // Restoring the tenant does not restore these - a freed number
            // may already be claimed elsewhere by then, which is the point.
            await req.payload.update({
              collection: 'users',
              where: { tenant: { equals: doc.id } },
              data: { phone: null },
              overrideAccess: true,
              req,
            });
          } else if (previousDoc.status === 'deleted') {
            action = 'tenant_restored';
            summary = `${doc.name} restored`;
          } else {
            action = 'tenant_reactivated';
            summary = `${doc.name} reactivated`;
          }
          metadata = { from: previousDoc.status, to: doc.status, reason: doc.statusReason ?? null };
        } else {
          action = 'subscription_changed';
          summary = `${doc.name}: ${previousDoc.subscriptionTier} -> ${doc.subscriptionTier}, ${previousDoc.billingStatus} -> ${doc.billingStatus}`;
          metadata = {
            subscriptionTier: { from: previousDoc.subscriptionTier, to: doc.subscriptionTier },
            billingStatus: { from: previousDoc.billingStatus, to: doc.billingStatus },
          };
        }
        if (doc.statusReason) summary += ` (${doc.statusReason})`;

        await req.payload.create({
          collection: 'platform-audit-log',
          overrideAccess: true,
          data: { tenant: Number(doc.id), actor: Number(req.user.id), action, summary, metadata },
          req,
        });
        return doc;
      },
    ],
  },
};
