import * as migration_20260825_085003_initial_baseline from './20260825_085003_initial_baseline';
import * as migration_20260831_080939_add_customer_email from './20260831_080939_add_customer_email';
import * as migration_20260831_125702_add_product_archive_and_related from './20260831_125702_add_product_archive_and_related';
import * as migration_20260901_051440_add_credit_payments from './20260901_051440_add_credit_payments';
import * as migration_20260901_052220_rename_max_discount_to_amount from './20260901_052220_rename_max_discount_to_amount';
import * as migration_20260901_072707_add_variant_prices from './20260901_072707_add_variant_prices';
import * as migration_20260901_081105_default_tax_and_optional_codes from './20260901_081105_default_tax_and_optional_codes';
import * as migration_20260901_084514_add_media_and_product_images from './20260901_084514_add_media_and_product_images';
import * as migration_20260903_064520_add_line_item_variant_tenant_store from './20260903_064520_add_line_item_variant_tenant_store';
import * as migration_20260903_073000_backfill_line_item_variant_tenant_store from './20260903_073000_backfill_line_item_variant_tenant_store';
import * as migration_20260903_090000_fix_tenant_store_column_types from './20260903_090000_fix_tenant_store_column_types';
import * as migration_20260903_114432_add_tenant_status_and_platform_audit_log from './20260903_114432_add_tenant_status_and_platform_audit_log';
import * as migration_20260907_055634_add_posts_blog from './20260907_055634_add_posts_blog';
import * as migration_20260907_061318_add_po_line_item_variant from './20260907_061318_add_po_line_item_variant';
import * as migration_20260907_075353_add_po_partial_receive from './20260907_075353_add_po_partial_receive';
import * as migration_20260921_102609_add_tenant_shifts_required from './20260921_102609_add_tenant_shifts_required';
import * as migration_20260921_131801_add_tenant_enforce_discount_caps from './20260921_131801_add_tenant_enforce_discount_caps';

export const migrations = [
  {
    up: migration_20260825_085003_initial_baseline.up,
    down: migration_20260825_085003_initial_baseline.down,
    name: '20260825_085003_initial_baseline',
  },
  {
    up: migration_20260831_080939_add_customer_email.up,
    down: migration_20260831_080939_add_customer_email.down,
    name: '20260831_080939_add_customer_email',
  },
  {
    up: migration_20260831_125702_add_product_archive_and_related.up,
    down: migration_20260831_125702_add_product_archive_and_related.down,
    name: '20260831_125702_add_product_archive_and_related',
  },
  {
    up: migration_20260901_051440_add_credit_payments.up,
    down: migration_20260901_051440_add_credit_payments.down,
    name: '20260901_051440_add_credit_payments',
  },
  {
    up: migration_20260901_052220_rename_max_discount_to_amount.up,
    down: migration_20260901_052220_rename_max_discount_to_amount.down,
    name: '20260901_052220_rename_max_discount_to_amount',
  },
  {
    up: migration_20260901_072707_add_variant_prices.up,
    down: migration_20260901_072707_add_variant_prices.down,
    name: '20260901_072707_add_variant_prices',
  },
  {
    up: migration_20260901_081105_default_tax_and_optional_codes.up,
    down: migration_20260901_081105_default_tax_and_optional_codes.down,
    name: '20260901_081105_default_tax_and_optional_codes',
  },
  {
    up: migration_20260901_084514_add_media_and_product_images.up,
    down: migration_20260901_084514_add_media_and_product_images.down,
    name: '20260901_084514_add_media_and_product_images',
  },
  {
    up: migration_20260903_064520_add_line_item_variant_tenant_store.up,
    down: migration_20260903_064520_add_line_item_variant_tenant_store.down,
    name: '20260903_064520_add_line_item_variant_tenant_store',
  },
  {
    up: migration_20260903_073000_backfill_line_item_variant_tenant_store.up,
    down: migration_20260903_073000_backfill_line_item_variant_tenant_store.down,
    name: '20260903_073000_backfill_line_item_variant_tenant_store',
  },
  {
    up: migration_20260903_090000_fix_tenant_store_column_types.up,
    down: migration_20260903_090000_fix_tenant_store_column_types.down,
    name: '20260903_090000_fix_tenant_store_column_types',
  },
  {
    up: migration_20260903_114432_add_tenant_status_and_platform_audit_log.up,
    down: migration_20260903_114432_add_tenant_status_and_platform_audit_log.down,
    name: '20260903_114432_add_tenant_status_and_platform_audit_log',
  },
  {
    up: migration_20260907_055634_add_posts_blog.up,
    down: migration_20260907_055634_add_posts_blog.down,
    name: '20260907_055634_add_posts_blog',
  },
  {
    up: migration_20260907_061318_add_po_line_item_variant.up,
    down: migration_20260907_061318_add_po_line_item_variant.down,
    name: '20260907_061318_add_po_line_item_variant',
  },
  {
    up: migration_20260907_075353_add_po_partial_receive.up,
    down: migration_20260907_075353_add_po_partial_receive.down,
    name: '20260907_075353_add_po_partial_receive',
  },
  {
    up: migration_20260921_102609_add_tenant_shifts_required.up,
    down: migration_20260921_102609_add_tenant_shifts_required.down,
    name: '20260921_102609_add_tenant_shifts_required',
  },
  {
    up: migration_20260921_131801_add_tenant_enforce_discount_caps.up,
    down: migration_20260921_131801_add_tenant_enforce_discount_caps.down,
    name: '20260921_131801_add_tenant_enforce_discount_caps'
  },
];
